import { emergencyCategoryKeys } from '../lib/reportSeverity';
import type { Response } from 'express';
import prisma from '../config/database';
import type { AuthRequest } from '../types/http';
import { getStationsForUser, buildStationFilter } from '../lib/accessScope';
import { resolveTugasStatus } from '../utils/tugasStatus';



export const getStats = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const role = req.user!.role;
    const stations = role === 'qc' ? await getStationsForUser(userId, role) : null;

    // Admin: scoped by managerId. QC/KUPT: scoped by stations.
    const managedFilter = role === 'qc' ? {} : { managerId: userId }; // QC doesn't own petugas, so count by station-based tugas

    // Count petugas
    let totalPetugas: number;
    if (role === 'qc') {
      // QC: count distinct petugas who have tugas in QC's stations
      const petugasInStations = await prisma.tugasPpj.findMany({
        where: buildStationFilter(stations),
        select: { assignedTo: true },
        distinct: ['assignedTo'],
      });
      totalPetugas = petugasInStations.length;
    } else {
      totalPetugas = await prisma.user.count({ where: { role: 'ppj', ...managedFilter } });
    }

    // Tugas filter
    const tugasWhere = role === 'qc'
      ? buildStationFilter(stations)
      : { user: managedFilter };

    const [tugasRows, laporanDarurat] = await Promise.all([
      prisma.tugasPpj.findMany({
        where: tugasWhere,
        select: {
          status: true,
          tracking: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { status: true, approvalStatus: true },
          },
        },
      }),
      prisma.laporan.count({
        where: {
          jenisTemuan: { in: await emergencyCategoryKeys() },
          tracking: { tugas: tugasWhere },
        },
      }),
    ]);
    const effectiveStatuses = tugasRows.map(item => resolveTugasStatus(item.status, item.tracking));
    const tugasAktif = effectiveStatuses.filter(status => ['pending', 'in_progress', 'need_approval'].includes(status)).length;
    const tugasSelesai = effectiveStatuses.filter(status => status === 'completed').length;

    return res.json({ success: true, data: { totalPetugas, tugasAktif, tugasSelesai, laporanDarurat } });
  } catch (error) {
    console.error('Admin stats error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const getAllPetugas = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const role = req.user!.role;
    const stations = role === 'qc' ? await getStationsForUser(userId, role) : null;

    let petugas;

    if (role === 'qc') {
      // QC: read-only — get petugas who have tugas in QC's stations
      const petugasIds = await prisma.tugasPpj.findMany({
        where: buildStationFilter(stations),
        select: { assignedTo: true },
        distinct: ['assignedTo'],
      });
      const ids = petugasIds.map(p => p.assignedTo);

      petugas = await prisma.user.findMany({
        where: { id: { in: ids }, role: 'ppj' },
        select: {
          id: true, nipp: true, nama: true, foto: true,
          tugasPpj: {
            where: { status: { in: ['pending', 'in_progress'] } },
            select: { id: true, jalur: true, status: true },
          },
        },
        orderBy: { nama: 'asc' },
      });
    } else {
      // Admin / KUPT: scoped by managerId
      petugas = await prisma.user.findMany({
        where: { role: 'ppj', managerId: userId },
        select: {
          id: true, nipp: true, nama: true, foto: true,
          tugasPpj: {
            where: { status: { in: ['pending', 'in_progress'] } },
            select: { id: true, jalur: true, status: true },
          },
        },
        orderBy: { nama: 'asc' },
      });
    }

    return res.json({ success: true, data: petugas });
  } catch (error) {
    console.error('Get petugas error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const getAvailablePetugas = async (_req: AuthRequest, res: Response) => {
  try {
    const petugas = await prisma.user.findMany({
      where: { role: 'ppj', managerId: null },
      select: { id: true, nipp: true, nama: true },
      orderBy: { nama: 'asc' },
    });
    return res.json({ success: true, data: petugas });
  } catch (error) {
    console.error('Get available petugas error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const addPetugasToManager = async (req: AuthRequest, res: Response) => {
  try {
    const managerId = req.user!.id;
    const { nipps } = req.body;

    if (!nipps || !Array.isArray(nipps) || nipps.length === 0) {
      return res.status(400).json({ success: false, message: 'Daftar NIPP wajib diisi' });
    }

    await prisma.user.updateMany({
      where: {
        nipp: { in: nipps },
        role: 'ppj',
        managerId: null,
      },
      data: { managerId },
    });

    return res.json({ success: true, message: 'Petugas berhasil ditambahkan ke daftar kelola Anda' });
  } catch (error) {
    console.error('Add petugas error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const removePetugasFromManager = async (req: AuthRequest, res: Response) => {
  try {
    const managerId = req.user!.id;
    const { id } = req.body;

    if (!id) return res.status(400).json({ success: false, message: 'ID Petugas wajib diisi' });

    const petugas = await prisma.user.findFirst({
      where: { id: parseInt(id), managerId },
    });

    if (!petugas) return res.status(404).json({ success: false, message: 'Petugas tidak ditemukan dalam daftar Anda' });

    await prisma.user.update({
      where: { id: petugas.id },
      data: { managerId: null },
    });

    return res.json({ success: true, message: 'Petugas berhasil dihapus dari daftar kelola Anda' });
  } catch (error) {
    console.error('Remove petugas error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const getAllEmergency = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const role = req.user!.role;
    const stations = role === 'qc' ? await getStationsForUser(userId, role) : null;

    const tugasFilter = role === 'qc'
      ? buildStationFilter(stations)
      : { user: { managerId: userId } };

    const laporan = await prisma.laporan.findMany({
      where: { tracking: { tugas: tugasFilter } },
      orderBy: { createdAt: 'desc' },
      include: {
        tracking: {
          select: { tugas: { select: { jalur: true, user: { select: { nama: true, nipp: true } } } } },
        },
      },
    });
    return res.json({ success: true, data: laporan });
  } catch (error) {
    console.error('Get emergency error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const getLivePositions = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const role = req.user!.role;
    const stations = role === 'qc' ? await getStationsForUser(userId, role) : null;

    const tugasFilter = role === 'qc'
      ? buildStationFilter(stations)
      : { user: { managerId: userId } };

    // Posisi live hanya berasal dari sesi tracking dan tugas yang masih aktif.
    const activeTrackings = await prisma.tracking.findMany({
      where: {
        status: 'started',
        tugas: { ...tugasFilter, status: 'in_progress' },
        OR: [
          { endLat: { not: null }, endLong: { not: null } },
          { startLat: { not: null }, startLong: { not: null } },
        ],
      },
      select: {
        startLat: true,
        startLong: true,
        endLat: true,
        endLong: true,
        updatedAt: true,
        tugas: {
          select: {
            id: true,
            jalur: true,
            user: { select: { nama: true, nipp: true } },
          },
        },
      },
    });

    const data = activeTrackings
      .map(t => ({
        petugasNama: t.tugas.user.nama,
        petugasNipp: t.tugas.user.nipp,
        tugasId: t.tugas.id,
        jalur: t.tugas.jalur,
        latitude: t.endLat ?? t.startLat!,
        longitude: t.endLong ?? t.startLong!,
        updatedAt: t.updatedAt,
      }));

    return res.json({ success: true, data });
  } catch (error) {
    console.error('Get live positions error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
