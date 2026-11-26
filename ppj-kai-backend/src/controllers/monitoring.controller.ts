import { speedSummary, type SpeedState } from '../../../shared/telemetry';
import { emergencyCategoryKeys } from '../lib/reportSeverity';
import type { Response } from 'express';
import prisma from '../config/database';
import type { AuthRequest } from '../types/http';
import { getStationsForUser, buildStationFilter, taskScope } from '../lib/accessScope';
import { resolveTugasStatus } from '../utils/tugasStatus';
import { countUnfinishedTasks } from '../lib/taskGuards';
import { audit } from '../lib/audit';



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
          id: true, nipp: true, nama: true, foto: true, isActive: true,
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
          id: true, nipp: true, nama: true, foto: true, isActive: true,
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
      where: { role: 'ppj', managerId: null, isActive: true }, // add accepts only active PPJ
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

    if (!Array.isArray(nipps) || nipps.length === 0 || nipps.length > 500
      || !nipps.every(nipp => typeof nipp === 'string' && nipp.trim() && nipp.trim().length <= 20)) {
      return res.status(400).json({ success: false, message: 'Daftar NIPP wajib diisi' });
    }

    const result = await prisma.user.updateMany({
      where: {
        nipp: { in: nipps.map(nipp => nipp.trim()) },
        role: 'ppj',
        isActive: true,
        managerId: null,
      },
      data: { managerId },
    });
    if (result.count === 0) {
      return res.status(409).json({ success: false, message: 'Tidak ada petugas yang dapat ditambahkan. Petugas mungkin sudah dikelola pengelola lain atau nonaktif.' });
    }

    const skipped = new Set(nipps.map(nipp => nipp.trim())).size - result.count;
    const message = skipped > 0
      ? `${result.count} petugas ditambahkan; ${skipped} dilewati karena sudah dikelola pengelola lain atau nonaktif`
      : 'Petugas berhasil ditambahkan ke daftar kelola Anda';
    return res.json({ success: true, message, data: { added: result.count, skipped } });
  } catch (error) {
    console.error('Add petugas error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const removePetugasFromManager = async (req: AuthRequest, res: Response) => {
  try {
    const managerId = req.user!.id;
    const { id } = req.body;

    const petugasId = Number(id);
    if (!Number.isSafeInteger(petugasId) || petugasId <= 0) return res.status(400).json({ success: false, message: 'ID Petugas wajib diisi' });

    const result = await prisma.$transaction(async tx => {
      const petugas = await tx.user.findFirst({ where: { id: petugasId, managerId } });
      if (!petugas) return { status: 404, message: 'Petugas tidak ditemukan dalam daftar Anda' };

      if (await countUnfinishedTasks(tx, [petugasId]) > 0) {
        return { status: 409, message: 'Petugas masih memiliki tugas terjadwal, inspeksi berjalan, atau hasil yang menunggu approval. Hapus tugas terjadwal atau selesaikan/approve dulu sebelum melepas petugas.' };
      }

      const released = await tx.user.updateMany({ where: { id: petugasId, managerId }, data: { managerId: null } });
      if (released.count !== 1) return { status: 409, message: 'Data petugas baru saja berubah. Muat ulang dan coba lagi.' };
      await audit(tx, managerId, 'petugas.release', 'user', petugasId, { nipp: petugas.nipp });
      return { status: 200, message: 'Petugas berhasil dihapus dari daftar kelola Anda' };
    });

    return res.status(result.status).json({ success: result.status === 200, message: result.message });
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

    // Photos (up to 7 MB each) are fetched per report from /emergency/:id/foto when opened.
    const laporan = await prisma.laporan.findMany({
      where: { tracking: { tugas: tugasFilter } },
      orderBy: { createdAt: 'desc' },
      // shortcut: newest 1000 reports only, add date-range paging when the map needs older ones.
      take: 1000,
      select: {
        id: true, trackingId: true, jenisTemuan: true, deskripsi: true, latitude: true, longitude: true, createdAt: true,
        handlingStatus: true, handledAt: true, handlingNote: true,
        handler: { select: { nama: true } },
        tracking: {
          select: { tugas: { select: { id: true, jalur: true, user: { select: { nama: true, nipp: true } } } } },
        },
      },
    });
    return res.json({ success: true, data: laporan });
  } catch (error) {
    console.error('Get emergency error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const HANDLING_STATUSES = new Set(['baru', 'ditangani', 'selesai']);

/** Pengelola PPJ (admin/KUPT sesuai managerId) menandai laporan sedang/sudah ditangani. */
export const updateEmergencyStatus = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const laporanId = Number(req.params.id);
    const { status, note } = req.body ?? {};
    if (typeof status !== 'string' || !HANDLING_STATUSES.has(status)) {
      return res.status(400).json({ success: false, message: 'Status harus baru, ditangani, atau selesai' });
    }
    if (note !== undefined && note !== null && (typeof note !== 'string' || note.length > 500)) {
      return res.status(400).json({ success: false, message: 'Catatan maksimal 500 karakter' });
    }
    const scope = await taskScope(userId, req.user!.role);
    if (!scope) return res.status(403).json({ success: false, message: 'Access denied' });

    const updated = await prisma.$transaction(async tx => {
      const found = await tx.laporan.findFirst({ where: { id: laporanId, tracking: { tugas: scope } }, select: { id: true, handlingStatus: true } });
      if (!found) return null;
      const trimmedNote = typeof note === 'string' ? note.trim() : undefined;
      const row = await tx.laporan.update({
        where: { id: laporanId },
        data: {
          handlingStatus: status,
          handledBy: status === 'baru' ? null : userId,
          handledAt: status === 'baru' ? null : new Date(),
          ...(trimmedNote !== undefined ? { handlingNote: trimmedNote || null } : {}),
        },
        select: { id: true, handlingStatus: true, handledAt: true, handlingNote: true, handler: { select: { nama: true } } },
      });
      await audit(tx, userId, 'laporan.handling', 'laporan', laporanId, { from: found.handlingStatus, to: status });
      return row;
    });
    if (!updated) return res.status(404).json({ success: false, message: 'Laporan tidak ditemukan' });
    return res.json({ success: true, data: updated });
  } catch (error) {
    console.error('Update emergency status error:', error);
    return res.status(500).json({ success: false, message: 'Gagal memperbarui status laporan' });
  }
};

export const getEmergencyPhoto = async (req: AuthRequest, res: Response) => {
  try {
    const scope = await taskScope(req.user!.id, req.user!.role);
    if (!scope) return res.status(403).json({ success: false, message: 'Access denied' });
    const laporan = await prisma.laporan.findFirst({
      where: { id: Number(req.params.id), tracking: { tugas: scope } },
      select: { foto: true },
    });
    if (!laporan) return res.status(404).json({ success: false, message: 'Laporan tidak ditemukan' });
    return res.json({ success: true, data: { foto: laporan.foto || null } });
  } catch (error) {
    console.error('Get emergency photo error:', error);
    return res.status(500).json({ success: false, message: 'Gagal mengambil foto laporan' });
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
        telemetryState: true, telemetryTest: true, positionCapturedAt: true, positionAccuracy: true, telemetryLoss: true,
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
        ...speedSummary(t.telemetryState as unknown as SpeedState, Date.now(), t.telemetryTest, t.telemetryLoss),
        positionCapturedAt: t.positionCapturedAt?.getTime() ?? null, accuracy: t.positionAccuracy,
      }));

    return res.json({ success: true, data });
  } catch (error) {
    console.error('Get live positions error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
