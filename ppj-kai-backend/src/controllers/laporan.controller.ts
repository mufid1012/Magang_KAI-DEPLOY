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
    if (typeof jenisTemuan !== 'string' || !jenisTemuan.trim() || jenisTemuan.length > 20) {
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
    let where: any;
    if (user.role === 'ppj') {
      where = { tracking: { tugas: { assignedTo: user.id } } };
    } else if (user.role === 'admin' || user.role === 'kupt') {
      where = { tracking: { tugas: { user: { managerId: user.id } } } };
    } else if (user.role === 'qc') {
      const assignments = await prisma.userWilayah.findMany({
        where: { userId: user.id },
        include: { wilayah: true },
      });
      const stations = assignments.flatMap(assignment => {
        try {
          const parsed = JSON.parse(assignment.wilayah.stations);
          return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
        } catch {
          return [];
        }
      });
      where = {
        tracking: {
          tugas: {
            OR: [
              { startPointName: { in: stations } },
              { endPointName: { in: stations } },
            ],
          },
        },
      };
    } else {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

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
