import { Request, Response } from 'express';
import prisma from '../config/database';

// GET /api/guest/map-data — public endpoint, tanpa auth
// Return tugas routes (koordinat only) + emergency markers
// TIDAK return data sensitif (nama petugas, NIPP)
export const getGuestMapData = async (req: Request, res: Response) => {
  try {
    // Get active/pending tugas with route coordinates only (no user data)
    const tugas = await prisma.tugasPpj.findMany({
      where: { status: { in: ['pending', 'in_progress'] } },
      select: {
        id: true,
        jalur: true,
        startPointLat: true,
        startPointLong: true,
        endPointLat: true,
        endPointLong: true,
        startPointName: true,
        endPointName: true,
        status: true,
      },
    });

    // Get emergency reports with coordinates (no user info)
    const emergencies = await prisma.laporan.findMany({
      where: { jenisTemuan: { in: ['emergency', 'berat'] } },
      select: {
        id: true,
        jenisTemuan: true,
        deskripsi: true,
        latitude: true,
        longitude: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 50, // limit to recent 50
    });

    return res.json({
      success: true,
      data: {
        tugas,
        emergencies,
      },
    });
  } catch (error) {
    console.error('Guest map data error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
