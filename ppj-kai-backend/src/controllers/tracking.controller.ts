import { Request, Response } from 'express';
import prisma from '../config/database';
import { hasWarningRoute, isSameWarningRoute, haversineMeters, selectWarningRecipients } from '../utils/warningRoute';

function isMissingWarningSchema(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const { code, meta } = error as { code?: unknown; meta?: { modelName?: unknown } };
  // P2021 = table missing, P2022 = column missing. Both occur when the
  // warning-route migration has not reached the deployment database yet.
  return (code === 'P2021' || code === 'P2022')
    && (meta?.modelName === undefined || meta.modelName === 'WarningAlert');
}

export const getActiveTracking = async (req: Request, res: Response) => {
  try {
    const tugasId = Number(req.params.tugasId);
    const userId = (req as any).user.id as number;
    if (!Number.isSafeInteger(tugasId) || tugasId <= 0) {
      return res.status(400).json({ success: false, message: 'ID tugas tidak valid' });
    }
    const tracking = await prisma.tracking.findFirst({
      where: { tugasId, status: 'started', tugas: { assignedTo: userId, status: 'in_progress' } },
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
    const parsedTugasId = Number(tugasId);
    const latitude = Number(lat);
    const longitude = Number(lng);
    const userId = (req as any).user.id as number;
    if (!Number.isSafeInteger(parsedTugasId) || parsedTugasId <= 0) {
      return res.status(400).json({ success: false, message: 'ID tugas tidak valid' });
    }
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
      return res.status(400).json({ success: false, message: 'Posisi GPS tidak valid' });
    }
    if (fotoAwal !== undefined && fotoAwal !== null && (typeof fotoAwal !== 'string' || fotoAwal.length > 7_000_000)) {
      return res.status(413).json({ success: false, message: 'Foto awal terlalu besar' });
    }
    const bypassEnabled = process.env.TRACKING_BYPASS_ENABLED === 'true';
    const useBypass = bypassEnabled && bypassMode === true;

    const tugas = await prisma.tugasPpj.findFirst({
      where: { id: parsedTugasId, assignedTo: userId }
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
    if (tugas.status !== 'pending') {
      return res.status(409).json({ success: false, message: 'Tugas tidak dapat memulai tracking pada status saat ini' });
    }

    // Time-window validation: only allow start within 1 hour before and 1 hour after jam_mulai
    if (!useBypass && tugas.jamMulai) {
      const [hours, minutes] = tugas.jamMulai.split(':').map(Number);
      if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours === undefined || minutes === undefined || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
        return res.status(500).json({ success: false, message: 'Jadwal tugas tidak valid' });
      }
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



    const tracking = await prisma.$transaction(async tx => {
      const claimed = await tx.tugasPpj.updateMany({
        where: { id: tugas.id, assignedTo: userId, status: 'pending' },
        data: { status: 'in_progress' },
      });
      if (claimed.count !== 1) throw new Error('TRACKING_ALREADY_STARTED');

      return tx.tracking.create({
        data: {
          tugasId: tugas.id,
          startTime: new Date(),
          startLat: latitude,
          startLong: longitude,
          status: 'started',
          fotoAwal: fotoAwal || null,
        },
      });
    });

    return res.json({ success: true, trackingId: tracking.id });
  } catch (error) {
    if (error instanceof Error && error.message === 'TRACKING_ALREADY_STARTED') {
      return res.status(409).json({ success: false, message: 'Tracking tugas sudah dimulai' });
    }
    console.error('Start tracking error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const updateTracking = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { lat, lng } = req.body;
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      return res.status(400).json({ success: false, message: 'Posisi GPS tidak valid' });
    }
    const tracking = await prisma.tracking.findFirst({
      where: { id: Number(id), status: 'started', tugas: { assignedTo: (req as any).user.id, status: 'in_progress' } }
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
    const trackingId = Number(id);
    const latitude = Number(lat);
    const longitude = Number(lng);
    const userId = (req as any).user.id as number;

    if (!Number.isSafeInteger(trackingId) || trackingId <= 0) {
      return res.status(400).json({ success: false, message: 'ID tracking tidak valid' });
    }
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
      return res.status(400).json({ success: false, message: 'Posisi GPS tidak valid' });
    }
    if (fotoSelesai !== undefined && fotoSelesai !== null && (typeof fotoSelesai !== 'string' || fotoSelesai.length > 7_000_000)) {
      return res.status(413).json({ success: false, message: 'Foto akhir terlalu besar' });
    }

    const tracking = await prisma.tracking.findFirst({
      where: {
        id: trackingId,
        status: 'started',
        tugas: { assignedTo: userId, status: 'in_progress' },
      },
    });

    if (!tracking) {
      return res.status(404).json({ success: false, message: 'Tracking session not found' });
    }

    // Calculate duration in seconds
    const durasiMs = tracking.startTime ? new Date().getTime() - new Date(tracking.startTime).getTime() : 0;
    const durasiDetik = Math.round(durasiMs / 1000);

    // Validate and serialize routePath. A 15-second GPS interval during a long
    // shift remains well below this limit.
    let routePathStr: string | null = null;
    if (routePath) {
      let parsedRoute: unknown = routePath;
      if (typeof routePath === 'string') {
        try { parsedRoute = JSON.parse(routePath); } catch { parsedRoute = null; }
      }
      if (!Array.isArray(parsedRoute) || parsedRoute.length > 20_000 || parsedRoute.some(point => (
        !Array.isArray(point) || point.length !== 2 ||
        !Number.isFinite(Number(point[0])) || !Number.isFinite(Number(point[1])) ||
        Math.abs(Number(point[0])) > 90 || Math.abs(Number(point[1])) > 180
      ))) {
        return res.status(400).json({ success: false, message: 'Rute GPS tidak valid' });
      }
      routePathStr = JSON.stringify(parsedRoute);
    }

    await prisma.$transaction(async tx => {
      const laporanCount = await tx.laporan.count({ where: { trackingId: tracking.id } });
      const stopped = await tx.tracking.updateMany({
        where: { id: tracking.id, status: 'started' },
        data: {
          endTime: new Date(),
          endLat: latitude,
          endLong: longitude,
          durasi: durasiDetik,
          status: 'stopped',
          fotoSelesai: fotoSelesai || null,
          routePath: routePathStr,
          approvalStatus: 'not_approved',
          safetyStatus: laporanCount > 0 ? 'tidak_aman' : 'aman',
          approvedAt: null,
          approvedBy: null,
        },
      });
      if (stopped.count !== 1) throw new Error('TRACKING_ALREADY_STOPPED');

      const taskUpdated = await tx.tugasPpj.updateMany({
        where: { id: tracking.tugasId, assignedTo: userId, status: 'in_progress' },
        data: { status: 'need_approval' },
      });
      if (taskUpdated.count !== 1) throw new Error('TRACKING_STATE_CHANGED');
    });

    return res.json({ success: true });
  } catch (error) {
    if (error instanceof Error && ['TRACKING_ALREADY_STOPPED', 'TRACKING_STATE_CHANGED'].includes(error.message)) {
      return res.status(409).json({ success: false, message: 'Status tracking sudah berubah. Muat ulang data tugas.' });
    }
    console.error('Stop tracking error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const approveTracking = async (req: Request, res: Response) => {
  try {
    const trackingId = Number(req.params.id);
    const adminId = (req as any).user.id as number;
    const safetyStatus = String(req.body.safetyStatus || '');

    if (!Number.isInteger(trackingId)) {
      return res.status(400).json({ success: false, message: 'ID tracking tidak valid' });
    }
    if (!['aman', 'tidak_aman'].includes(safetyStatus)) {
      return res.status(400).json({ success: false, message: 'Status keselamatan harus aman atau tidak_aman' });
    }

    const tracking = await prisma.tracking.findFirst({
      where: { id: trackingId, tugas: { user: { managerId: adminId } } },
    });
    if (!tracking) {
      return res.status(404).json({ success: false, message: 'Hasil tracking tidak ditemukan dalam kelolaan Anda' });
    }
    if (tracking.status !== 'stopped') {
      return res.status(400).json({ success: false, message: 'Tracking hanya dapat disetujui setelah inspeksi selesai' });
    }
    if (tracking.approvalStatus === 'approved') {
      return res.status(400).json({ success: false, message: 'Hasil tracking sudah disetujui' });
    }

    const [data] = await prisma.$transaction([
      prisma.tracking.update({
        where: { id: trackingId },
        data: {
          approvalStatus: 'approved',
          safetyStatus,
          approvedAt: new Date(),
          approvedBy: adminId,
        },
      }),
      prisma.tugasPpj.update({
        where: { id: tracking.tugasId },
        data: { status: 'completed' },
      }),
    ]);
    return res.json({ success: true, message: 'Hasil tracking berhasil disetujui', data, tugasStatus: 'completed' });
  } catch (error) {
    console.error('Approve tracking error:', error);
    return res.status(500).json({ success: false, message: 'Gagal menyetujui hasil tracking' });
  }
};

export const createNearbyWarning = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id as number;
    const latitude = Number(req.body.lat);
    const longitude = Number(req.body.lng);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
      return res.status(400).json({ success: false, message: 'Posisi GPS tidak valid' });
    }

    const tugasId = req.body.tugasId === undefined ? undefined : Number(req.body.tugasId);
    if (tugasId !== undefined && (!Number.isInteger(tugasId) || tugasId <= 0)) {
      return res.status(400).json({ success: false, message: 'ID tugas tidak valid' });
    }
    const activeTracking = await prisma.tracking.findFirst({
      where: { ...(tugasId === undefined ? {} : { tugasId }), status: 'started', tugas: { assignedTo: userId, status: 'in_progress' } },
      orderBy: { startTime: 'desc' },
      select: { id: true, tugas: true },
    });
    if (!activeTracking) {
      return res.status(400).json({ success: false, message: 'Warning hanya dapat dikirim saat tracking aktif' });
    }

    if (!hasWarningRoute(activeTracking.tugas)) {
      return res.status(400).json({ success: false, message: 'Stasiun awal dan akhir tugas harus tersedia untuk mengirim warning' });
    }
    const { startPointName, endPointName } = activeTracking.tugas;
    const now = new Date();
    const recent = await prisma.warningAlert.findFirst({
      where: { createdBy: userId, createdAt: { gte: new Date(now.getTime() - 30_000) } },
    });
    if (recent) {
      return res.status(429).json({ success: false, message: 'Tunggu 30 detik sebelum mengirim warning lagi' });
    }

    const candidates = await prisma.tracking.findMany({
      where: { status: 'started', updatedAt: { gte: new Date(now.getTime() - 120_000) }, tugas: { assignedTo: { not: userId }, status: 'in_progress' } },
      include: { tugas: true },
    });
    const recipients = selectWarningRecipients({ latitude, longitude, userId }, activeTracking.tugas,
      candidates.flatMap(candidate => {
        const lat = candidate.endLat ?? candidate.startLat;
        const lng = candidate.endLong ?? candidate.startLong;
        return lat == null || lng == null ? [] : [{ id: candidate.id, userId: candidate.tugas.assignedTo, latitude: lat, longitude: lng, updatedAt: candidate.updatedAt, tugas: candidate.tugas }];
      }), now);
    if (!recipients.length) {
      return res.status(400).json({ success: false, message: 'Tidak ada PPJ lain pada jalur yang sama dengan tracking aktif dan GPS terbaru' });
    }

    await prisma.warningAlert.deleteMany({ where: { expiresAt: { lt: now } } });
    const data = await prisma.warningAlert.create({
      data: {
        createdBy: userId,
        startPointName,
        endPointName,
        recipientOneTrackingId: recipients[0]!,
        recipientTwoTrackingId: recipients[1] ?? null,
        latitude,
        longitude,
        expiresAt: new Date(now.getTime() + 2 * 60_000),
      },
    });
    return res.status(201).json({ success: true, message: `Warning jalur ${startPointName} ke ${endPointName} dikirim ke ${recipients.length} PPJ terdekat pada jalur yang sama`, data });
  } catch (error) {
    console.error('Create nearby warning error:', error);
    if (isMissingWarningSchema(error)) {
      return res.status(503).json({
        success: false,
        message: 'Fitur warning belum siap di server. Perbarui skema database warning lalu coba lagi.',
        code: 'WARNING_SCHEMA_OUTDATED',
      });
    }
    return res.status(500).json({ success: false, message: 'Gagal mengirim warning' });
  }
};

export const getNearbyWarnings = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id as number;
    const latitude = Number(req.query.lat);
    const longitude = Number(req.query.lng);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
      return res.status(400).json({ success: false, message: 'Posisi GPS wajib dikirim' });
    }

    const tugasId = req.query.tugasId === undefined ? undefined : Number(req.query.tugasId);
    if (tugasId !== undefined && (!Number.isInteger(tugasId) || tugasId <= 0)) {
      return res.status(400).json({ success: false, message: 'ID tugas tidak valid' });
    }
    const activeTracking = await prisma.tracking.findFirst({
      where: { ...(tugasId === undefined ? {} : { tugasId }), status: 'started', tugas: { assignedTo: userId, status: 'in_progress' } },
      orderBy: { startTime: 'desc' },
      select: { id: true, tugas: true },
    });
    if (!activeTracking || !hasWarningRoute(activeTracking.tugas)) {
      return res.json({ success: true, data: [] });
    }

    const warnings = await prisma.warningAlert.findMany({
      where: {
        createdBy: { not: userId },
        expiresAt: { gte: new Date() },
        OR: [{ recipientOneTrackingId: activeTracking.id }, { recipientTwoTrackingId: activeTracking.id }],
      },
      include: { creator: { select: { nama: true, nipp: true } } },
      orderBy: { createdAt: 'desc' },
    });
    const data = warnings
      .filter(warning => isSameWarningRoute(warning, activeTracking.tugas))
      .map(warning => ({
        ...warning,
        // PPJ berjalan berlawanan dengan arah kereta. Karena itu arah datang
        // kereta selalu memakai tujuan akhir tugas milik PPJ pengirim warning.
        trainDirectionName: warning.endPointName,
        distanceMeters: Math.round(haversineMeters(latitude, longitude, warning.latitude, warning.longitude)),
      }))
      .slice(0, 50);

    return res.json({ success: true, data });
  } catch (error) {
    console.error('Get nearby warnings error:', error);
    return res.status(500).json({ success: false, message: 'Gagal mengambil warning sekitar' });
  }
};
