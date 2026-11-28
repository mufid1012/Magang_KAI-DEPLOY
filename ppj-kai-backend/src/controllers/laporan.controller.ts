import { taskScope } from '../lib/accessScope';
import { Request, Response } from 'express';
import prisma from '../config/database';
import { checkPhoto, PHOTO_FORMAT_MESSAGE } from '../lib/photo';
import { KENDALA_PPJ_KEY } from '../../../shared/display';

export const createLaporan = async (req: Request, res: Response) => {
  try {
    const { trackingId, jenisTemuan, deskripsi, lat, lng, fotoUrl } = req.body;
    const userId = (req as any).user.id as number;
    const parsedTrackingId = Number(trackingId);
    const latitude = Number(lat);
    const longitude = Number(lng);

    if (!Number.isSafeInteger(parsedTrackingId) || parsedTrackingId <= 0) {
      return res.status(400).json({ success: false, message: 'ID tracking tidak valid' });
    }
    if (typeof jenisTemuan !== 'string' || !jenisTemuan.trim() || jenisTemuan.trim().length > 50) {
      return res.status(400).json({ success: false, message: 'Jenis temuan tidak valid' });
    }
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
      return res.status(400).json({ success: false, message: 'Posisi GPS tidak valid' });
    }
    if (deskripsi !== undefined && (typeof deskripsi !== 'string' || deskripsi.length > 5000)) {
      return res.status(400).json({ success: false, message: 'Deskripsi terlalu panjang' });
    }
    const photo = checkPhoto(fotoUrl);
    if (!photo.ok) {
      return res.status(photo.status).json({ success: false, message: photo.status === 413 ? 'Foto terlalu besar' : PHOTO_FORMAT_MESSAGE });
    }

    const tracking = await prisma.tracking.findFirst({
      where: {
        id: parsedTrackingId,
        status: 'started',
        tugas: { assignedTo: userId, status: 'in_progress' },
      },
      select: { id: true },
    });
    if (!tracking) {
      return res.status(404).json({ success: false, message: 'Tracking aktif tidak ditemukan' });
    }

    // Kendala PPJ is a fixed report type, so admins cannot disable or delete it as a category.
    if (jenisTemuan.trim() !== KENDALA_PPJ_KEY) {
      const category = await prisma.kategoriTemuan.findUnique({ where: { key: jenisTemuan.trim() }, select: { isActive: true } });
      if (!category?.isActive) return res.status(400).json({ success: false, message: 'Kategori temuan tidak tersedia' });
    }

    const laporan = await prisma.laporan.create({
      data: {
        trackingId: tracking.id,
        jenisTemuan: jenisTemuan.trim(),
        deskripsi: deskripsi || '',
        foto: photo.value ?? '',
        latitude,
        longitude,
      }
    });

    return res.json({ success: true, data: laporan });
  } catch (error) {
    console.error('Create laporan error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const getLaporan = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user as { id: number; role: string };
    const scope = await taskScope(user.id, user.role);
    if (!scope) return res.status(403).json({ success: false, message: 'Access denied' });
    const where = { tracking: { tugas: scope } };

    // Legacy endpoint: keep its shape but not the payload. Report photos come from
    // /admin/emergency/:id/foto, and tracking photos/route from the task detail.
    const laporan = await prisma.laporan.findMany({
      where,
      take: 1000, // shortcut: newest 1000 only, add paging if an old client needs more
      select: {
        id: true, trackingId: true, jenisTemuan: true, deskripsi: true, latitude: true, longitude: true, createdAt: true,
        tracking: {
          select: {
            id: true, tugasId: true, startTime: true, endTime: true, durasi: true, status: true,
            approvalStatus: true, safetyStatus: true, approvedAt: true,
            tugas: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return res.json({ success: true, data: laporan });
  } catch (error) {
    console.error('Get laporan error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
