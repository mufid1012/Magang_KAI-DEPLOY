import { taskScope } from '../lib/accessScope';
import { parseAssignmentDate, assignmentTimes } from '../utils/assignmentValidation';
import type { Response } from 'express';
import prisma from '../config/database';
import type { AuthRequest } from '../types/http';
import { getStationsForUser, buildStationFilter } from '../lib/accessScope';
import { ensureMapLocationsTable } from '../lib/mapLocationsTable';
import { resolveTugasStatus } from '../utils/tugasStatus';



export const getAllTugas = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const role = req.user!.role;
    const stations = role === 'qc' ? await getStationsForUser(userId, role) : null;

    const whereClause = role === 'qc'
      ? buildStationFilter(stations)
      : { user: { managerId: userId } };

    const tugas = await prisma.tugasPpj.findMany({
      where: { ...whereClause, ...(req.query.petugasId ? { assignedTo: Number(req.query.petugasId) } : {}) },
      include: {
        user: { select: { id: true, nama: true, nipp: true, jabatan: true, division: true, workArea: true } },
        tracking: {
          orderBy: { createdAt: 'desc' as const },
          take: 1,
          ...(req.query.summary === 'true' ? { select: {
            id: true, startTime: true, endTime: true, durasi: true, status: true, approvalStatus: true, safetyStatus: true, approvedAt: true,
            laporan: { select: { id: true, jenisTemuan: true, deskripsi: true, latitude: true, longitude: true, createdAt: true } },
          } } : { include: { laporan: true } }),
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    const data = tugas.map(item => ({
      ...item,
      status: resolveTugasStatus(item.status, item.tracking),
    }));
    return res.json({ success: true, data });
  } catch (error) {
    console.error('Get all tugas error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const createTugas = async (req: AuthRequest, res: Response) => {
  try {
    const managerId = req.user!.id;
    const role = req.user!.role;
    const {
      jalur, tanggal, startPointLat, startPointLong, endPointLat, endPointLong,
      startPointName, endPointName, startMapLocationId, endMapLocationId,
      jamMulai, jamSelesai, assignedTo,
    } = req.body;

    if (typeof jalur !== 'string' || !jalur.trim() || jalur.length > 200 || !tanggal || [startPointLat,startPointLong,endPointLat,endPointLong].some(value => value === null || value === undefined || value === '') || !Number.isSafeInteger(Number(assignedTo)) || Number(assignedTo) <= 0) {
      return res.status(400).json({ success: false, message: 'Field wajib tidak lengkap' });
    }

    const parsedDate = parseAssignmentDate(tanggal);
    const times = assignmentTimes(jamMulai, jamSelesai);
    if (!parsedDate || !times) return res.status(400).json({ success: false, message: 'Tanggal atau jam tugas tidak valid' });

    let resolvedStart = {
      name: String(startPointName || ''),
      latitude: Number(startPointLat),
      longitude: Number(startPointLong),
    };
    let resolvedEnd = {
      name: String(endPointName || ''),
      latitude: Number(endPointLat),
      longitude: Number(endPointLong),
    };

    const requestedMapLocationIds = [startMapLocationId, endMapLocationId]
      .filter((value): value is string | number => value !== undefined && value !== null && value !== '')
      .map(value => Number(value));

    if (requestedMapLocationIds.length > 0) {
      if (role !== 'admin' || requestedMapLocationIds.some(id => !Number.isInteger(id))) {
        return res.status(400).json({ success: false, message: 'Titik MAP tidak valid' });
      }

      await ensureMapLocationsTable();
      const registeredLocations = await prisma.mapLocation.findMany({
        where: { id: { in: requestedMapLocationIds }, createdBy: managerId },
      });
      const locationById = new Map(registeredLocations.map(location => [location.id, location]));

      if (startMapLocationId) {
        const location = locationById.get(Number(startMapLocationId));
        if (!location) return res.status(400).json({ success: false, message: 'Titik MAP awal tidak ditemukan' });
        resolvedStart = { name: location.name, latitude: location.latitude, longitude: location.longitude };
      }
      if (endMapLocationId) {
        const location = locationById.get(Number(endMapLocationId));
        if (!location) return res.status(400).json({ success: false, message: 'Titik MAP akhir tidak ditemukan' });
        resolvedEnd = { name: location.name, latitude: location.latitude, longitude: location.longitude };
      }
    }

    if (
      ![resolvedStart.latitude, resolvedStart.longitude, resolvedEnd.latitude, resolvedEnd.longitude].every(Number.isFinite) ||
      Math.abs(resolvedStart.latitude) > 90 || Math.abs(resolvedEnd.latitude) > 90 ||
      Math.abs(resolvedStart.longitude) > 180 || Math.abs(resolvedEnd.longitude) > 180
    ) {
      return res.status(400).json({ success: false, message: 'Koordinat titik pengecekan tidak valid' });
    }

    if ((resolvedStart.name && resolvedStart.name === resolvedEnd.name) || (resolvedStart.latitude === resolvedEnd.latitude && resolvedStart.longitude === resolvedEnd.longitude)) {
      return res.status(400).json({ success: false, message: 'Titik awal dan akhir tidak boleh sama' });
    }
    // KUPT: validate that station names are within their wilayah
    if (role === 'kupt') {
      const stations = await getStationsForUser(managerId, role);
      if (stations) {
        const startOk = !resolvedStart.name || stations.includes(resolvedStart.name);
        const endOk = !resolvedEnd.name || stations.includes(resolvedEnd.name);
        if (!startOk || !endOk) {
          return res.status(403).json({ success: false, message: 'Stasiun di luar wilayah Anda' });
        }
      }
    }

    // Ensure the assigned petugas belongs to this manager
    const petugasCheck = await prisma.user.findFirst({
      where: { id: Number(assignedTo), managerId, role: 'ppj', isActive: true },
    });

    if (!petugasCheck) return res.status(403).json({ success: false, message: 'Petugas tidak ditemukan dalam daftar kelola Anda' });

    const tugas = await prisma.tugasPpj.create({
      data: {
        jalur,
        tanggal: parsedDate,
        startPointLat: resolvedStart.latitude,
        startPointLong: resolvedStart.longitude,
        endPointLat: resolvedEnd.latitude,
        endPointLong: resolvedEnd.longitude,
        startPointName: resolvedStart.name,
        endPointName: resolvedEnd.name,
        ...times,
        assignedTo: Number(assignedTo),
        status: 'pending',
      },
      include: { user: { select: { nama: true, nipp: true } } },
    });

    return res.status(201).json({ success: true, data: tugas });
  } catch (error) {
    console.error('Create tugas error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const deleteTugas = async (req: AuthRequest, res: Response) => {
  try {
    const managerId = req.user!.id;
    const role = req.user!.role;
    const { id } = req.params;

    // Check if task belongs to a managed user
    const tugas = await prisma.tugasPpj.findFirst({
      where: { id: Number(id), user: { managerId } },
    });

    if (!tugas) return res.status(403).json({ success: false, message: 'Tugas tidak ditemukan atau tidak diizinkan' });

    // KUPT: additionally validate task is within their wilayah
    if (role === 'kupt') {
      const stations = await getStationsForUser(managerId, role);
      if (stations) {
        const inWilayah = (tugas.startPointName && stations.includes(tugas.startPointName)) ||
                          (tugas.endPointName && stations.includes(tugas.endPointName));
        if (!inWilayah) {
          return res.status(403).json({ success: false, message: 'Tugas di luar wilayah Anda' });
        }
      }
    }

    // Cascade delete: laporan → tracking → tugas
    const tugasId = Number(id);
    await prisma.$transaction([
      prisma.laporan.deleteMany({ where: { tracking: { tugasId } } }),
      prisma.tracking.deleteMany({ where: { tugasId } }),
      prisma.tugasPpj.delete({ where: { id: tugasId } }),
    ]);
    return res.json({ success: true, message: 'Tugas dihapus' });
  } catch (error) {
    console.error('Delete tugas error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/** Lazy detail for dashboard modals; same scope as the list and PDF. */
export const getAdminTugasById = async (req: AuthRequest, res: Response) => {
  try {
    const id=Number(req.params.id);
    if (!Number.isSafeInteger(id) || id<=0) return res.status(400).json({success:false,message:'ID tugas tidak valid'});
    const scope=await taskScope(req.user!.id,req.user!.role);
    if (!scope) return res.status(403).json({success:false,message:'Access denied'});
    const task=await prisma.tugasPpj.findFirst({ where:{id,...scope}, include:{ user:{select:{id:true,nama:true,nipp:true,jabatan:true,division:true,workArea:true}}, tracking:{orderBy:{createdAt:'desc'},take:1,include:{laporan:true}}} });
    if (!task) return res.status(404).json({success:false,message:'Tugas tidak ditemukan'});
    return res.json({success:true,data:{...task,status:resolveTugasStatus(task.status,task.tracking)}});
  } catch(error) { console.error('Task detail error:',error); return res.status(500).json({success:false,message:'Gagal mengambil detail tugas'}); }
};
