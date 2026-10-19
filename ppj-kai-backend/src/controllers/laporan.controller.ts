import { taskScope } from '../lib/accessScope';
import { Request, Response } from 'express';
import prisma from '../config/database';

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
    if (fotoUrl !== undefined && fotoUrl !== null && (typeof fotoUrl !== 'string' || fotoUrl.length > 7_000_000)) {
      return res.status(413).json({ success: false, message: 'Foto terlalu besar' });
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

    const category = await prisma.kategoriTemuan.findUnique({ where: { key: jenisTemuan.trim() }, select: { isActive: true } });
    if (!category?.isActive) return res.status(400).json({ success: false, message: 'Kategori temuan tidak tersedia' });

    const laporan = await prisma.laporan.create({
      data: {
        trackingId: tracking.id,
        jenisTemuan: jenisTemuan.trim(),
        deskripsi: deskripsi || '',
        foto: fotoUrl || '',
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

    const laporan = await prisma.laporan.findMany({
      where,
      include: {
        tracking: {
          include: {
            tugas: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    return res.json({ success: true, data: laporan });
  } catch (error) {
    console.error('Get laporan error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
