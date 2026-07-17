import { Request, Response } from 'express';
import prisma from '../config/database';

export const getActiveTracking = async (req: Request, res: Response) => {
  try {
    const tugasId = parseInt(req.params.tugasId);
    const tracking = await prisma.tracking.findFirst({
      where: { tugasId, status: { not: 'stopped' } },
      orderBy: { startTime: 'desc' },
      select: { id: true, startTime: true, routePath: true },
    });
    return res.json({ success: true, trackingId: tracking?.id ?? null, startTime: tracking?.startTime ?? null, routePath: tracking?.routePath ?? null });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const startTracking = async (req: Request, res: Response) => {
  try {
    const { tugasId } = req.params;
    const { lat, lng, fotoAwal, bypassMode } = req.body;
    // Temporary deployment-testing switch. Set TRACKING_BYPASS_ENABLED=false
    // after testing to enforce the schedule on every request again.
    const bypassEnabled = process.env.TRACKING_BYPASS_ENABLED !== 'false';
    const useBypass = bypassEnabled && bypassMode === true;

    const tugas = await prisma.tugasPpj.findUnique({
      where: { id: parseInt(tugasId) }
    });

    if (!tugas) {
      return res.status(404).json({ success: false, message: 'Tugas not found' });
    }

    // Reject if task is already missed or cancelled
    if (!useBypass && tugas.status === 'missed') {
      return res.status(400).json({ success: false, message: 'Tugas sudah melewati batas waktu (missed). Tidak dapat memulai tracking.' });
    }
    if (tugas.status === 'cancelled') {
      return res.status(400).json({ success: false, message: 'Tugas sudah dibatalkan.' });
    }

    // Time-window validation: only allow start within 1 hour before and 1 hour after jam_mulai
    if (!useBypass && tugas.jamMulai) {
      const [hours, minutes] = tugas.jamMulai.split(':').map(Number);
      const tugasDate = new Date(tugas.tanggal);

      // Build scheduled start time in WIB (UTC+7)
      // tugas.tanggal is a Date object from Prisma — use its UTC date parts since it's stored as DATE
      const scheduledTime = new Date(Date.UTC(
        tugasDate.getUTCFullYear(),
        tugasDate.getUTCMonth(),
        tugasDate.getUTCDate(),
        hours - 7, // Convert WIB to UTC
        minutes
      ));

      const windowStart = new Date(scheduledTime.getTime() - 60 * 60 * 1000); // 1 hour before
      const windowEnd = new Date(scheduledTime.getTime() + 60 * 60 * 1000);   // 1 hour after
      const now = new Date();

      if (now < windowStart) {
        const windowStartWIB = new Date(windowStart.getTime() + 7 * 60 * 60 * 1000);
        const timeStr = windowStartWIB.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false });
        return res.status(400).json({
          success: false,
          message: `Tracking belum bisa dimulai. Dibuka mulai pukul ${timeStr} WIB.`,
          code: 'TOO_EARLY',
          windowStart: windowStart.toISOString(),
          windowEnd: windowEnd.toISOString()
        });
      }

      if (now > windowEnd) {
        return res.status(400).json({
          success: false,
          message: 'Waktu tracking telah berakhir. Tugas akan ditandai sebagai tidak selesai.',
          code: 'TOO_LATE',
          windowStart: windowStart.toISOString(),
          windowEnd: windowEnd.toISOString()
        });
      }
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
    const { lat, lng, fotoSelesai, routePath } = req.body;

    const tracking = await prisma.tracking.findUnique({
      where: { id: parseInt(id) }
    });

    if (!tracking) {
      return res.status(404).json({ success: false, message: 'Tracking session not found' });
    }

    // Calculate duration in seconds
    const durasiMs = tracking.startTime ? new Date().getTime() - new Date(tracking.startTime).getTime() : 0;
    const durasiDetik = Math.round(durasiMs / 1000);

    // Serialize routePath to JSON string if provided as array
    let routePathStr: string | null = null;
    if (routePath) {
      routePathStr = typeof routePath === 'string' ? routePath : JSON.stringify(routePath);
    }

    await prisma.tracking.update({
      where: { id: tracking.id },
      data: {
        endTime: new Date(),
        endLat: lat || 0,
        endLong: lng || 0,
        durasi: durasiDetik,
        status: 'stopped',
        fotoSelesai: fotoSelesai || null,
        routePath: routePathStr,
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
