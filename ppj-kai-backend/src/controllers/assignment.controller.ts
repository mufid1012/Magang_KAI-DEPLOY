import { taskScope } from '../lib/accessScope';
import { parseAssignmentDate, assignmentTimes, scheduleProblem } from '../utils/assignmentValidation';
import { findDuplicateAssignment, findOverlappingAssignment, lockPetugas, scheduleConflictMessage } from '../lib/taskGuards';
import { audit } from '../lib/audit';
import type { Response } from 'express';
import prisma from '../config/database';
import type { AuthRequest } from '../types/http';
import { getStationsForUser, buildStationFilter } from '../lib/accessScope';
import { resolveTugasStatus } from '../utils/tugasStatus';
import { loadGpsGaps } from '../lib/telemetry';
import { STATIONS } from '../../../shared/stations';



export const getAllTugas = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const role = req.user!.role;
    const stations = role === 'qc' ? await getStationsForUser(userId, role) : null;

    const whereClause = role === 'qc'
      ? buildStationFilter(stations)
      : { user: { managerId: userId } };

    const petugasId = req.query.petugasId === undefined ? undefined : Number(req.query.petugasId);
    if (petugasId !== undefined && (!Number.isSafeInteger(petugasId) || petugasId <= 0 || petugasId > 2147483647)) {
      return res.status(400).json({ success: false, message: 'ID petugas tidak valid' });
    }

    const tugas = await prisma.tugasPpj.findMany({
      where: { ...whereClause, ...(petugasId ? { assignedTo: petugasId } : {}) },
      include: {
        user: { select: { id: true, nama: true, nipp: true, jabatan: true, division: true, workArea: true } },
        tracking: {
          orderBy: { createdAt: 'desc' as const },
          take: 1,
          // Start/stop photos (up to 7 MB each), the route and telemetry come from GET /admin/tugas/:id.
          // Without summary the petugas history still needs report photos, so only those are added.
          select: {
            id: true, startTime: true, endTime: true, durasi: true, status: true, approvalStatus: true, safetyStatus: true, approvedAt: true, forcedStopAt: true, rejectionReason: true, earlyStopReason: true,
            laporan: { select: { id: true, jenisTemuan: true, deskripsi: true, latitude: true, longitude: true, createdAt: true, ...(req.query.summary === 'true' ? {} : { foto: true }) } },
          },
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
    // Client coordinates (startPointLat etc.) are ignored: points are resolved from the
    // station catalog or a registered MAP point so the PPJ geofence matches the name.
    const {
      jalur, tanggal, startPointName, endPointName, startMapLocationId, endMapLocationId,
      jamMulai, jamSelesai, assignedTo,
    } = req.body;

    if (typeof jalur !== 'string' || !jalur.trim() || jalur.length > 200 || !tanggal || !Number.isSafeInteger(Number(assignedTo)) || Number(assignedTo) <= 0) {
      return res.status(400).json({ success: false, message: 'Field wajib tidak lengkap' });
    }

    const parsedDate = parseAssignmentDate(tanggal);
    const times = assignmentTimes(jamMulai, jamSelesai);
    if (!parsedDate || !times) return res.status(400).json({ success: false, message: 'Tanggal atau jam tugas tidak valid' });
    const problem = scheduleProblem(parsedDate, times.jamMulai, times.jamSelesai);
    if (problem) return res.status(400).json({ success: false, message: problem });

    const catalogPoint = (name: unknown) => {
      const station = typeof name === 'string' ? STATIONS.find(item => item.name === name.trim()) : undefined;
      return station ? { name: station.name, latitude: station.lat, longitude: station.lng } : null;
    };
    let resolvedStart = catalogPoint(startPointName) ?? { name: '', latitude: NaN, longitude: NaN };
    let resolvedEnd = catalogPoint(endPointName) ?? { name: '', latitude: NaN, longitude: NaN };

    const requestedMapLocationIds = [startMapLocationId, endMapLocationId]
      .filter((value): value is string | number => value !== undefined && value !== null && value !== '')
      .map(value => Number(value));

    if (requestedMapLocationIds.length > 0) {
      if (role !== 'admin' || requestedMapLocationIds.some(id => !Number.isInteger(id))) {
        return res.status(400).json({ success: false, message: 'Titik MAP tidak valid' });
      }

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

    if (!resolvedStart.name || !resolvedEnd.name) {
      return res.status(400).json({ success: false, message: 'Pilih titik awal dan akhir dari daftar stasiun atau titik MAP' });
    }

    if (resolvedStart.name === resolvedEnd.name || (resolvedStart.latitude === resolvedEnd.latitude && resolvedStart.longitude === resolvedEnd.longitude)) {
      return res.status(400).json({ success: false, message: 'Titik awal dan akhir tidak boleh sama' });
    }
    // KUPT: validate that station names are within their wilayah
    if (role === 'kupt') {
      const stations = await getStationsForUser(managerId, role);
      if (stations) {
        if (!stations.includes(resolvedStart.name) || !stations.includes(resolvedEnd.name)) {
          return res.status(403).json({ success: false, message: 'Stasiun di luar wilayah Anda' });
        }
      }
    }

    // Ensure the assigned petugas belongs to this manager
    const petugasCheck = await prisma.user.findFirst({
      where: { id: Number(assignedTo), managerId, role: 'ppj', isActive: true },
    });

    if (!petugasCheck) return res.status(403).json({ success: false, message: 'Petugas tidak ditemukan dalam daftar kelola Anda' });
    const outcome = await prisma.$transaction(async tx => {
      // Same lock as Excel import, so a double click or a parallel import cannot both insert.
      await lockPetugas(tx, Number(assignedTo));
      if (await findDuplicateAssignment(tx, {
        assignedTo: Number(assignedTo), tanggal: parsedDate, startPointName: resolvedStart.name, endPointName: resolvedEnd.name, jamMulai: times.jamMulai,
      })) return { error: 'Tugas yang sama untuk petugas ini pada tanggal dan jam tersebut sudah ada' };
      const clash = await findOverlappingAssignment(tx, {
        assignedTo: Number(assignedTo), tanggal: parsedDate, jamMulai: times.jamMulai!, jamSelesai: times.jamSelesai,
      });
      if (clash) return { error: `${scheduleConflictMessage(clash)} untuk petugas ini` };

      const tugas = await tx.tugasPpj.create({
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
      return { tugas };
    });
    if ('error' in outcome) return res.status(409).json({ success: false, message: outcome.error });

    return res.status(201).json({ success: true, data: outcome.tugas });
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
      include: { tracking: { orderBy: { createdAt: 'desc' }, take: 1, select: { status: true, approvalStatus: true } } },
    });

    if (!tugas) return res.status(403).json({ success: false, message: 'Tugas tidak ditemukan atau tidak diizinkan' });

    // Do not pull a running inspection from under the PPJ, nor discard one awaiting review.
    const effectiveStatus = resolveTugasStatus(tugas.status, tugas.tracking);
    if (effectiveStatus === 'in_progress' || tugas.tracking[0]?.status === 'started') {
      return res.status(409).json({ success: false, message: 'Tugas sedang dikerjakan petugas dan tidak dapat dihapus' });
    }
    if (effectiveStatus === 'need_approval') {
      return res.status(409).json({ success: false, message: 'Tugas menunggu approval. Approve hasil inspeksi sebelum menghapus tugas.' });
    }
    // Photos, findings and the GPS trail are the inspection record; deleting would erase it for good.
    if (tugas.tracking.length > 0) {
      return res.status(409).json({ success: false, message: 'Tugas sudah memiliki hasil inspeksi dan tidak dapat dihapus agar riwayatnya tetap tersimpan.' });
    }

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

    const tugasId = Number(id);
    await prisma.$transaction(async tx => {
      // Delete only while the status is still the one checked, so a PPJ start racing this fails cleanly.
      // A started task has a tracking row, which also blocks the delete via its foreign key.
      if (await tx.tracking.count({ where: { tugasId } })) throw new Error('TASK_STATE_CHANGED');
      const deleted = await tx.tugasPpj.deleteMany({ where: { id: tugasId, status: tugas.status } });
      if (deleted.count !== 1) throw new Error('TASK_STATE_CHANGED');
      await audit(tx, managerId, 'task.delete', 'task', tugasId, { jalur: tugas.jalur, tanggal: tugas.tanggal.toISOString().slice(0, 10), assignedTo: tugas.assignedTo, status: tugas.status });
    });
    return res.json({ success: true, message: 'Tugas dihapus' });
  } catch (error) {
    if (error instanceof Error && error.message === 'TASK_STATE_CHANGED') {
      return res.status(409).json({ success: false, message: 'Status tugas baru saja berubah. Muat ulang data tugas.' });
    }
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
    const task=await prisma.tugasPpj.findFirst({ where:{id,...scope}, include:{ user:{select:{id:true,nama:true,nipp:true,jabatan:true,division:true,workArea:true}}, tracking:{orderBy:{createdAt:'desc'},take:1,include:{laporan:true,forcedStopper:{select:{nama:true,nipp:true}},rejecter:{select:{nama:true,nipp:true}}}}} });
    if (!task) return res.status(404).json({success:false,message:'Tugas tidak ditemukan'});
    const tracking=await Promise.all(task.tracking.map(async t=>({...t,gpsGaps:await loadGpsGaps(prisma,t)})));
    return res.json({success:true,data:{...task,tracking,status:resolveTugasStatus(task.status,task.tracking)}});
  } catch(error) { console.error('Task detail error:',error); return res.status(500).json({success:false,message:'Gagal mengambil detail tugas'}); }
};
