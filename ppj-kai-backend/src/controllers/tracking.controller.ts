import { forceStoppedError, ingestBatch, lockTracking, parseBatch, serverRoute, TelemetryError } from '../lib/telemetry';
import { speedSummary, type SpeedState } from '../../../shared/telemetry';
import { taskScope } from '../lib/accessScope';
import { parseRoute } from '../../../shared/route';
import { haversineMeters as distanceMeters } from '../../../shared/geo';
import { Request, Response } from 'express';
import prisma from '../config/database';
import { checkPhoto, PHOTO_FORMAT_MESSAGE } from '../lib/photo';
import { parseSignature } from '../lib/signature';
import { startWindow } from '../utils/schedule';
import { audit } from '../lib/audit';
import { hasWarningRoute, hasOverlappingWarningRoute, haversineMeters, resolveWarningPosition, selectWarningRecipients, WARNING_POSITION_TTL_MS, WARNING_RETENTION_MS } from '../utils/warningRoute';

// Keep the existing API fields while recipient storage supports any number of sessions.
function warningResponse<T extends { recipients: { trackingId: number }[] }>(record: T) {
  const { recipients, ...warning } = record;
  return {
    ...warning,
    recipientOneTrackingId: recipients[0]?.trackingId ?? null,
    recipientTwoTrackingId: recipients[1]?.trackingId ?? null,
  };
}

function isMissingWarningSchema(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const { code, meta } = error as { code?: unknown; meta?: { modelName?: unknown } };
  // P2021 = table missing, P2022 = column missing. Both occur when the
  // warning-route migration has not reached the deployment database yet.
  return (code === 'P2021' || code === 'P2022')
    && (meta?.modelName === undefined || meta.modelName === 'WarningAlert' || meta.modelName === 'WarningRecipient');
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
      select: { id: true, startTime: true, routePath: true, telemetryState: true, telemetryTest: true },
    });
    return res.json({ success: true, trackingId: tracking?.id ?? null, startTime: tracking?.startTime ?? null, routePath: tracking?.routePath ?? null, telemetryState: tracking?.telemetryState ?? null, telemetryTest: tracking?.telemetryTest ?? false });
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
    const photo = checkPhoto(fotoAwal);
    if (!photo.ok) {
      return res.status(photo.status).json({ success: false, message: photo.status === 413 ? 'Foto awal terlalu besar' : PHOTO_FORMAT_MESSAGE });
    }
    const bypassEnabled = process.env.TRACKING_BYPASS_ENABLED !== 'false';
    const useBypass = bypassEnabled && bypassMode === true;

    const tugas = await prisma.tugasPpj.findFirst({
      where: { id: parsedTugasId, assignedTo: userId }
    });

    if (!tugas) {
      return res.status(404).json({ success: false, message: 'Tugas not found' });
    }

    if (!useBypass && (!photo.value || distanceMeters(latitude, longitude, tugas.startPointLat, tugas.startPointLong) > 500)) {
      return res.status(400).json({ success: false, message: 'Foto awal dan posisi dalam radius 500 meter dari titik awal wajib dipenuhi' });
    }
    // Reject if task is already missed
    if (!useBypass && tugas.status === 'missed') {
      return res.status(400).json({ success: false, message: 'Tugas sudah melewati batas waktu (missed). Tidak dapat memulai tracking.' });
    }
    if (tugas.status !== 'pending' && !(useBypass && tugas.status === 'missed')) {
      return res.status(409).json({ success: false, message: 'Tugas tidak dapat memulai tracking pada status saat ini' });
    }

    // Start only within 1 hour either side of jam mulai (legacy tasks without a time: their own day).
    if (!useBypass) {
      const window = startWindow(tugas.tanggal, tugas.jamMulai);
      if (!window) {
        return res.status(500).json({ success: false, message: 'Jadwal tugas tidak valid' });
      }
      const { opensAt: windowStart, closesAt: windowEnd } = window;
      const now = new Date();

      if (now < windowStart) {
        // Format in WIB explicitly; the server's own time zone must not shift the clock.
        const day = windowStart.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'Asia/Jakarta' });
        const timeStr = `${day}, ${windowStart.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Jakarta' })}`;
        return res.status(400).json({
          success: false,
          message: `Tracking belum bisa dimulai. Dibuka mulai ${timeStr} WIB.`,
          code: 'TOO_EARLY',
          windowStart: windowStart.toISOString(),
          windowEnd: windowEnd.toISOString()
        });
      }

      if (now > windowEnd) {
        // Don't wait for the 5-minute scheduler: dashboards should show "missed" now.
        await prisma.tugasPpj.updateMany({ where: { id: tugas.id, status: 'pending' }, data: { status: 'missed' } });
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
      // Same user-row lock as account updates: a deactivation and a start cannot interleave,
      // and two starts by one PPJ are serialized so only one inspection runs at a time.
      const [account] = await tx.$queryRaw<{ is_active: number }[]>`SELECT is_active FROM users WHERE id = ${userId} FOR UPDATE`;
      if (!account?.is_active) throw new Error('ACCOUNT_INACTIVE');
      if (await tx.tugasPpj.count({ where: { assignedTo: userId, status: 'in_progress' } })) throw new Error('ANOTHER_TRACKING_ACTIVE');
      const claimed = await tx.tugasPpj.updateMany({
        where: {
          id: tugas.id,
          assignedTo: userId,
          status: useBypass ? { in: ['pending', 'missed'] } : 'pending',
        },
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
          fotoAwal: photo.value,
          telemetryTest: useBypass,
        },
      });
    });

    return res.json({ success: true, trackingId: tracking.id, startTime: tracking.startTime });
  } catch (error) {
    if (error instanceof Error && error.message === 'TRACKING_ALREADY_STARTED') {
      return res.status(409).json({ success: false, message: 'Tracking tugas sudah dimulai' });
    }
    if (error instanceof Error && error.message === 'ANOTHER_TRACKING_ACTIVE') {
      return res.status(409).json({ success: false, code: 'ANOTHER_TRACKING_ACTIVE', message: 'Masih ada inspeksi lain yang berjalan. Selesaikan inspeksi itu dulu.' });
    }
    if (error instanceof Error && error.message === 'ACCOUNT_INACTIVE') {
      return res.status(401).json({ success: false, message: 'Akun sudah dihapus atau dinonaktifkan' });
    }
    console.error('Start tracking error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const updateTracking = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const userId = (req as any).user.id as number;
    if (req.body.samples !== undefined) {
      const now = Date.now();
      const loss = req.body.reportedLoss ?? 0;
      if (!Number.isSafeInteger(loss) || loss < 0 || loss > 2147483647) throw new TelemetryError(400, 'Metadata kehilangan sampel tidak valid');
      const samples = parseBatch(req.body.samples, now);
      const result = await prisma.$transaction(async tx => {
        const tracking = await lockTracking(tx, id, userId);
        if (loss > tracking.telemetryLoss) await tx.tracking.update({where: {id}, data: {telemetryLoss: loss}});
        return { ...(await ingestBatch(tx, tracking, samples, now)), isTest: tracking.telemetryTest, reportedLoss: Math.max(loss, tracking.telemetryLoss) };
      });
      return res.json({ success: true, acknowledged: result.acknowledged, summary: speedSummary(result.state, now, result.isTest, result.reportedLoss) });
    }
    // Legacy clients remain accepted but cannot invent sample timestamps or speed.
    const { lat, lng } = req.body;
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      return res.status(400).json({ success: false, message: 'Posisi GPS tidak valid' });
    }
    const tracking = await prisma.tracking.findFirst({where: {id, status: 'started', tugas: {assignedTo: userId, status: 'in_progress'}}, select: {id: true}});
    if (!tracking) {
      const forced = await forceStoppedError(prisma, id, userId);
      if (forced) throw forced;
      return res.status(404).json({success: false, message: 'Tracking session not found'});
    }
    await prisma.$transaction(async tx => {
      const locked = await lockTracking(tx, id, userId);
      // Do not replace timestamped telemetry with an un-timestamped legacy position.
      if (!locked.telemetryState) await tx.tracking.updateMany({where: {id, status: 'started'}, data: {endLat: lat, endLong: lng}});
    });

    return res.json({ success: true });
  } catch (error) {
    if (error instanceof TelemetryError) return res.status(error.status).json({ success: false, message: error.message, code: error.code });
    console.error('Update tracking error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const stopTracking = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { lat, lng, fotoSelesai, routePath, bypassMode } = req.body;
    const useBypass = process.env.TRACKING_BYPASS_ENABLED !== 'false' && bypassMode === true;
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
    const photo = checkPhoto(fotoSelesai);
    if (!photo.ok) {
      return res.status(photo.status).json({ success: false, message: photo.status === 413 ? 'Foto akhir terlalu besar' : PHOTO_FORMAT_MESSAGE });
    }
    // Like the end photo, the PPJ's online signature is required in normal mode and optional in bypass.
    const hasSignature = req.body.ttdPetugas !== undefined && req.body.ttdPetugas !== null && req.body.ttdPetugas !== '';
    const signature = hasSignature ? parseSignature(req.body.ttdPetugas) : null;
    if (signature && !signature.ok) return res.status(400).json({ success: false, message: signature.message });
    if (!signature && !useBypass) return res.status(400).json({ success: false, message: 'Tanda tangan petugas wajib diisi' });

    const tracking = await prisma.tracking.findFirst({
      where: {
        id: trackingId,
        status: 'started',
        tugas: { assignedTo: userId, status: 'in_progress' },
      },
      include: { tugas: { select: { endPointLat: true, endPointLong: true } } },
    });

    if (!tracking) {
      const forced = await forceStoppedError(prisma, trackingId, userId);
      if (forced) throw forced;
      return res.status(404).json({ success: false, message: 'Tracking session not found' });
    }

    // Blocked track or an emergency: the PPJ may end before the end point with a reason.
    // The photo stays required, and the manager sees the reason when reviewing.
    const earlyStopReason = typeof req.body.earlyStopReason === 'string' ? req.body.earlyStopReason.trim() : '';
    if (earlyStopReason && (earlyStopReason.length < 5 || earlyStopReason.length > 500)) {
      return res.status(400).json({ success: false, message: 'Alasan mengakhiri lebih awal 5 sampai 500 karakter' });
    }
    const atEnd = useBypass || distanceMeters(latitude, longitude, tracking.tugas.endPointLat, tracking.tugas.endPointLong) <= 500;
    if (!useBypass && (!photo.value || (!atEnd && !earlyStopReason))) {
      return res.status(400).json({ success: false, message: 'Foto akhir dan posisi dalam radius 500 meter dari titik akhir wajib dipenuhi, atau isi alasan mengakhiri lebih awal' });
    }

    // Calculate duration in seconds
    const durasiMs = tracking.startTime ? new Date().getTime() - new Date(tracking.startTime).getTime() : 0;
    const durasiDetik = Math.round(durasiMs / 1000);

    // Accept older high-frequency sessions; bound storage while retaining both endpoints.
    const parsedRoute = routePath === undefined || routePath === null ? null : parseRoute(routePath);
    if (routePath !== undefined && routePath !== null && !parsedRoute) {
      return res.status(400).json({ success: false, message: 'Rute GPS tidak valid' });
    }

    const finalLoss = req.body.reportedLoss ?? 0;
    if (!Number.isSafeInteger(finalLoss) || finalLoss < 0 || finalLoss > 2147483647) throw new TelemetryError(400, 'Metadata kehilangan sampel tidak valid');
    const finalSamples = req.body.samples === undefined ? [] : parseBatch(req.body.samples, Date.now());
    await prisma.$transaction(async tx => {
      const locked = await lockTracking(tx, tracking.id, userId);
      if (finalLoss > locked.telemetryLoss) await tx.tracking.update({where: {id: tracking.id}, data: {telemetryLoss: finalLoss}});
      if (useBypass && !locked.telemetryTest) {
        await tx.tracking.update({where: {id: tracking.id}, data: {telemetryTest: true}});
        await tx.speedEvent.updateMany({where: {trackingId: tracking.id}, data: {isTest: true}});
        locked.telemetryTest = true;
      }
      if (finalSamples.length) await ingestBatch(tx, locked, finalSamples, Date.now());
      // Device trail lost (reload, cleared storage): fall back to what the server received.
      const route = parsedRoute && parsedRoute.length >= 2 ? parsedRoute : await serverRoute(tx, tracking.id);
      const routePathStr = route.length >= 2 ? JSON.stringify(route) : null;
      const laporanCount = await tx.laporan.count({ where: { trackingId: tracking.id } });
      const stopped = await tx.tracking.updateMany({
        where: { id: tracking.id, status: 'started' },
        data: {
          endTime: new Date(),
          endLat: latitude,
          endLong: longitude,
          durasi: durasiDetik,
          status: 'stopped',
          fotoSelesai: photo.value,
          ttdPetugas: signature?.ok ? signature.value : null,
          routePath: routePathStr,
          // Only recorded when it actually mattered: an end inside the geofence is a normal stop.
          earlyStopReason: earlyStopReason && !atEnd ? earlyStopReason : null,
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
    if (error instanceof TelemetryError) return res.status(error.status).json({ success: false, message: error.message, code: error.code });
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
    const signature = parseSignature(req.body.ttdApprover);
    if (!signature.ok) return res.status(400).json({ success: false, message: 'Tanda tangan penyetuju wajib diisi' });

    // Approver is the PPJ's manager: the super admin or KUPT that manages them.
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

    // Conditional claims: a double click or two approvers cannot overwrite each other.
    // Legacy tasks may already be 'completed' while their tracking is unapproved.
    const data = await prisma.$transaction(async tx => {
      const claimed = await tx.tracking.updateMany({
        where: { id: trackingId, status: 'stopped', approvalStatus: 'not_approved', tugas: { user: { managerId: adminId } } },
        data: { approvalStatus: 'approved', safetyStatus, approvedAt: new Date(), approvedBy: adminId, ttdApprover: signature.value },
      });
      if (claimed.count !== 1) throw new Error('APPROVAL_STATE_CHANGED');
      const task = await tx.tugasPpj.updateMany({
        where: { id: tracking.tugasId, status: { in: ['need_approval', 'completed'] } },
        data: { status: 'completed' },
      });
      if (task.count !== 1) throw new Error('APPROVAL_STATE_CHANGED');
      await audit(tx, adminId, 'tracking.approve', 'tracking', trackingId, { safetyStatus });
      return tx.tracking.findUniqueOrThrow({ where: { id: trackingId } });
    });
    return res.json({ success: true, message: 'Hasil tracking berhasil disetujui', data, tugasStatus: 'completed' });
  } catch (error) {
    if (error instanceof Error && error.message === 'APPROVAL_STATE_CHANGED') {
      return res.status(409).json({ success: false, message: 'Status hasil tracking sudah berubah. Muat ulang data tugas.' });
    }
    console.error('Approve tracking error:', error);
    return res.status(500).json({ success: false, message: 'Gagal menyetujui hasil tracking' });
  }
};

/**
 * The managing admin/KUPT turns a result down (bypass misuse, wrong photo, route not walked).
 * Nothing is deleted: the tracking keeps its data with the reason, and the task closes as
 * 'rejected'. A re-inspection is a new task.
 */
export const rejectTracking = async (req: Request, res: Response) => {
  try {
    const trackingId = Number(req.params.id);
    const managerId = (req as any).user.id as number;
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
    if (reason.length < 5 || reason.length > 500) {
      return res.status(400).json({ success: false, message: 'Alasan penolakan wajib diisi, 5 sampai 500 karakter' });
    }
    const rejected = await prisma.$transaction(async tx => {
      const tracking = await tx.tracking.findFirst({
        where: { id: trackingId, status: 'stopped', approvalStatus: 'not_approved', tugas: { user: { managerId } } },
        select: { tugasId: true },
      });
      if (!tracking) return false;
      const claimed = await tx.tracking.updateMany({
        where: { id: trackingId, status: 'stopped', approvalStatus: 'not_approved' },
        data: { approvalStatus: 'rejected', rejectedBy: managerId, rejectedAt: new Date(), rejectionReason: reason },
      });
      const task = await tx.tugasPpj.updateMany({ where: { id: tracking.tugasId, status: { in: ['need_approval', 'completed'] } }, data: { status: 'rejected' } });
      if (claimed.count !== 1 || task.count !== 1) throw new Error('APPROVAL_STATE_CHANGED');
      await audit(tx, managerId, 'tracking.reject', 'tracking', trackingId, { reason });
      return true;
    });
    if (!rejected) return res.status(404).json({ success: false, message: 'Hasil yang menunggu approval tidak ditemukan dalam kelolaan Anda' });
    return res.json({ success: true, message: 'Hasil inspeksi ditolak', tugasStatus: 'rejected' });
  } catch (error) {
    if (error instanceof Error && error.message === 'APPROVAL_STATE_CHANGED') {
      return res.status(409).json({ success: false, message: 'Status hasil tracking sudah berubah. Muat ulang data tugas.' });
    }
    console.error('Reject tracking error:', error);
    return res.status(500).json({ success: false, message: 'Gagal menolak hasil tracking' });
  }
};

/**
 * The managing admin/KUPT ends a session the PPJ cannot finish (dead phone, lost signal,
 * account issue). The task moves to need_approval so the result is still reviewed.
 * The route comes from server-received GPS samples because the device copy is unavailable;
 * end time is the last received sample, so idle hours after the phone died are not counted.
 */
export const forceStopTracking = async (req: Request, res: Response) => {
  try {
    const trackingId = Number(req.params.id);
    const managerId = (req as any).user.id as number;
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
    if (!Number.isSafeInteger(trackingId) || trackingId <= 0) {
      return res.status(400).json({ success: false, message: 'ID tracking tidak valid' });
    }
    if (reason.length < 5 || reason.length > 500) {
      return res.status(400).json({ success: false, message: 'Alasan wajib diisi, 5 sampai 500 karakter' });
    }

    const stopped = await prisma.$transaction(async tx => {
      // Same lock as PPJ update/stop, so a simultaneous normal stop cannot interleave.
      await tx.$queryRaw`SELECT id FROM tracking WHERE id = ${trackingId} FOR UPDATE`;
      const tracking = await tx.tracking.findFirst({
        where: { id: trackingId, status: 'started', tugas: { status: 'in_progress', user: { managerId } } },
        select: { id: true, tugasId: true, startTime: true, startLat: true, startLong: true, endLat: true, endLong: true },
      });
      if (!tracking) return null;

      const route = await serverRoute(tx, trackingId);
      const lastSample = await tx.trackingSample.findFirst({
        where: { trackingId, quality: { not: 'before_start' } },
        orderBy: { capturedAt: 'desc' },
        select: { capturedAt: true, latitude: true, longitude: true },
      });
      const now = new Date();
      const endTime = lastSample && tracking.startTime && lastSample.capturedAt > tracking.startTime ? lastSample.capturedAt : now;
      const durasi = tracking.startTime ? Math.max(0, Math.round((endTime.getTime() - tracking.startTime.getTime()) / 1000)) : 0;
      const laporanCount = await tx.laporan.count({ where: { trackingId } });

      const updated = await tx.tracking.updateMany({
        where: { id: trackingId, status: 'started' },
        data: {
          status: 'stopped',
          endTime,
          durasi,
          endLat: tracking.endLat ?? lastSample?.latitude ?? tracking.startLat,
          endLong: tracking.endLong ?? lastSample?.longitude ?? tracking.startLong,
          fotoSelesai: null,
          routePath: route.length >= 2 ? JSON.stringify(route) : null,
          approvalStatus: 'not_approved',
          safetyStatus: laporanCount > 0 ? 'tidak_aman' : 'aman',
          approvedAt: null,
          approvedBy: null,
          forcedStopBy: managerId,
          forcedStopAt: now,
          forcedStopReason: reason,
        },
      });
      if (updated.count !== 1) throw new Error('TRACKING_STATE_CHANGED');
      const task = await tx.tugasPpj.updateMany({ where: { id: tracking.tugasId, status: 'in_progress' }, data: { status: 'need_approval' } });
      if (task.count !== 1) throw new Error('TRACKING_STATE_CHANGED');
      await audit(tx, managerId, 'tracking.force_stop', 'tracking', trackingId, { reason });
      return { tugasId: tracking.tugasId, forcedStopAt: now };
    });

    if (!stopped) {
      return res.status(404).json({ success: false, message: 'Inspeksi aktif tidak ditemukan dalam kelolaan Anda' });
    }
    return res.json({ success: true, message: 'Inspeksi dihentikan paksa dan menunggu approval', tugasStatus: 'need_approval', data: stopped });
  } catch (error) {
    if (error instanceof Error && error.message === 'TRACKING_STATE_CHANGED') {
      return res.status(409).json({ success: false, message: 'Status inspeksi sudah berubah. Muat ulang data tugas.' });
    }
    console.error('Force stop tracking error:', error);
    return res.status(500).json({ success: false, message: 'Gagal menghentikan inspeksi' });
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

    // Jangan saring hanya lewat positionCapturedAt: kolom itu kosong selama belum ada
    // sampel yang lolos akurasi <= 20 m, padahal sesinya masih aktif mengirim sampel.
    const candidates = await prisma.tracking.findMany({
      where: { status: 'started', OR: [{ positionCapturedAt: { gte: new Date(now.getTime() - WARNING_POSITION_TTL_MS) } }, { updatedAt: { gte: new Date(now.getTime() - WARNING_POSITION_TTL_MS) } }], tugas: { assignedTo: { not: userId }, status: 'in_progress' } },
      include: { tugas: true, telemetrySamples: { orderBy: { capturedAt: 'desc' }, take: 1 } },
    });
    const recipients = selectWarningRecipients({ latitude, longitude, userId }, activeTracking.tugas,
      candidates.flatMap(candidate => {
        const position = resolveWarningPosition({ ...candidate, latestSample: candidate.telemetrySamples?.[0] ?? null }, now);
        return position ? [{ id: candidate.id, userId: candidate.tugas.assignedTo, ...position, tugas: candidate.tugas }] : [];
      }), now);
    if (!recipients.length) {
      return res.status(400).json({ success: false, message: 'Tidak ada PPJ lain pada jalur terkait dengan tracking aktif dan GPS terbaru' });
    }

    // Expired warnings stay as history for the QC warning report; only rows past retention go.
    await prisma.warningAlert.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - WARNING_RETENTION_MS) } } });
    const data = await prisma.warningAlert.create({
      data: {
        createdBy: userId,
        trackingId: activeTracking.id,
        startPointName,
        endPointName,
        recipients: { create: recipients.map(trackingId => ({ trackingId })) },
        latitude,
        longitude,
        expiresAt: new Date(now.getTime() + 2 * 60_000),
      },
      include: { recipients: { select: { trackingId: true }, orderBy: { id: 'asc' } } },
    });
    return res.status(201).json({ success: true, message: `Warning jalur ${startPointName} ke ${endPointName} dikirim ke ${recipients.length} PPJ terdekat pada jalur terkait`, data: warningResponse(data) });
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
        recipients: { some: { trackingId: activeTracking.id } },
      },
      include: {
        creator: { select: { nama: true, nipp: true } },
        recipients: { select: { trackingId: true }, orderBy: { id: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
    });
    const data = warnings
      .filter(warning => hasOverlappingWarningRoute(warning, activeTracking.tugas))
      .map(warning => ({
        ...warningResponse(warning),
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

// Detail is fetched on demand, with a bounded event page; no sample history in live payloads.
export const getTelemetryDetail = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user as {id: number; role: string};
    const scope = await taskScope(user.id, user.role);
    if (!scope) return res.status(403).json({success: false});
    const tracking = await prisma.tracking.findFirst({where: {id: Number(req.params.id), tugas: scope},
      select: {id: true, telemetryState: true, telemetryTest: true, telemetryLoss: true, status: true}});
    if (!tracking) return res.status(404).json({success: false});
    const cursor = req.query.cursor === undefined ? 0 : Number(req.query.cursor);
    if (!Number.isSafeInteger(cursor) || cursor < 0) return res.status(400).json({success: false});
    const events = await prisma.speedEvent.findMany({where: {trackingId: tracking.id, id: {gt: cursor}}, orderBy: {id: 'asc'}, take: 51});
    return res.json({success: true, summary: speedSummary(tracking.telemetryState as unknown as SpeedState, Date.now(), tracking.telemetryTest, tracking.telemetryLoss),
      events: events.slice(0,50), nextCursor: events.length > 50 ? events[49]!.id : null});
  } catch (error) { console.error('Telemetry detail error:', error); return res.status(500).json({success: false}); }
};
