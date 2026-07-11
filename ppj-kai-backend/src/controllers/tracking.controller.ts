import { Request, Response } from 'express';
import prisma from '../config/database';

export const getActiveTracking = async (req: Request, res: Response) => {
  try {
    const tugasId = parseInt(req.params.tugasId);
    const tracking = await prisma.tracking.findFirst({
      where: { tugasId, status: { not: 'stopped' } },
      orderBy: { startTime: 'desc' },
      select: { id: true, startTime: true },
    });
    return res.json({ success: true, trackingId: tracking?.id ?? null, startTime: tracking?.startTime ?? null });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const startTracking = async (req: Request, res: Response) => {
  try {
    const { tugasId } = req.params;
    const { lat, lng, fotoAwal } = req.body;

    const tugas = await prisma.tugasPpj.findUnique({
      where: { id: parseInt(tugasId) }
    });

    if (!tugas) {
      return res.status(404).json({ success: false, message: 'Tugas not found' });
    }

    // Create tracking session with proper schema fields
    const tracking = await prisma.tracking.create({
      data: {
        tugasId: tugas.id,
        startTime: new Date(),
        startLat: lat || 0,
        startLong: lng || 0,
        status: 'started',
        fotoAwal: fotoAwal || null,
      }
    });

    // Update tugas status
    await prisma.tugasPpj.update({
      where: { id: tugas.id },
      data: { status: 'in_progress' }
    });

    return res.json({ success: true, trackingId: tracking.id });
  } catch (error) {
    console.error('Start tracking error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const updateTracking = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { lat, lng } = req.body;

    const tracking = await prisma.tracking.findUnique({
      where: { id: parseInt(id) }
    });

    if (!tracking) {
      return res.status(404).json({ success: false, message: 'Tracking session not found' });
    }

    // Update end position as latest position
    await prisma.tracking.update({
      where: { id: tracking.id },
      data: { endLat: lat, endLong: lng }
    });

    return res.json({ success: true });
  } catch (error) {
    console.error('Update tracking error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const stopTracking = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { lat, lng, fotoSelesai } = req.body;

    const tracking = await prisma.tracking.findUnique({
      where: { id: parseInt(id) }
    });

    if (!tracking) {
      return res.status(404).json({ success: false, message: 'Tracking session not found' });
    }

    // Calculate duration in seconds
    const durasiMs = tracking.startTime ? new Date().getTime() - new Date(tracking.startTime).getTime() : 0;
    const durasiDetik = Math.round(durasiMs / 1000);

    await prisma.tracking.update({
      where: { id: tracking.id },
      data: { 
        endTime: new Date(),
        endLat: lat || 0,
        endLong: lng || 0,
        durasi: durasiDetik,
        status: 'completed',
        fotoSelesai: fotoSelesai || null,
      }
    });

    // Update tugas status
    await prisma.tugasPpj.update({
      where: { id: tracking.tugasId },
      data: { status: 'completed' }
    });

    return res.json({ success: true });
  } catch (error) {
    console.error('Stop tracking error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
