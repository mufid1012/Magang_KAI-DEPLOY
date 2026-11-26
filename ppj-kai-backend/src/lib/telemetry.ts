import type { Prisma, Tracking } from '@prisma/client';
import { advanceSpeed, initialSpeedState, TELEMETRY, validSampleShape } from '../../../shared/telemetry';
import type { SpeedEvent, SpeedState, TelemetrySample } from '../../../shared/telemetry';
import { compactRoute, type RoutePoint } from '../../../shared/route';

export class TelemetryError extends Error {
  constructor(public status: number, message: string, public code?: string) { super(message); }
}
export const FORCE_STOPPED_CODE = 'TRACKING_FORCE_STOPPED';
/** Lets the PPJ app tell "your manager ended this session" apart from a generic conflict. */
export async function forceStoppedError(db: Pick<Prisma.TransactionClient, 'tracking'>, id: number, userId: number): Promise<TelemetryError | null> {
  const stopped = await db.tracking.findFirst({ where: { id, forcedStopAt: { not: null }, tugas: { assignedTo: userId } }, select: { id: true } });
  return stopped ? new TelemetryError(409, 'Inspeksi ini sudah dihentikan oleh pengelola dan menunggu approval.', FORCE_STOPPED_CODE) : null;
}
type SampleDb = Pick<Prisma.TransactionClient, 'trackingSample'>;

/** Route from server-received samples, for when the device copy is missing (dead phone, reload). */
export async function serverRoute(db: SampleDb, trackingId: number): Promise<RoutePoint[]> {
  const samples = await db.trackingSample.findMany({
    where: { trackingId, accuracy: { lte: TELEMETRY.MAX_ACCURACY_M }, quality: { notIn: ['before_start', 'jump'] } },
    orderBy: { capturedAt: 'asc' },
    select: { latitude: true, longitude: true },
  });
  return compactRoute(samples.map((sample): RoutePoint => [sample.latitude, sample.longitude]));
}

export type GpsGap = { from: Date; to: Date };

/** Periods without any sample, counting session start and end as edges. Any accuracy counts: the phone was alive. */
export function gpsGaps(times: Date[], start: Date | null, end: Date | null, minMs: number = TELEMETRY.GPS_GAP_MS): GpsGap[] {
  const edges = [start, ...times, end].filter((t): t is Date => t !== null);
  const gaps: GpsGap[] = [];
  for (let i = 1; i < edges.length; i++) {
    if (edges[i]!.getTime() - edges[i - 1]!.getTime() >= minMs) gaps.push({ from: edges[i - 1]!, to: edges[i]! });
  }
  return gaps;
}

export async function loadGpsGaps(db: SampleDb, tracking: { id: number; startTime: Date | null; endTime: Date | null }): Promise<GpsGap[]> {
  const samples = await db.trackingSample.findMany({
    where: { trackingId: tracking.id, quality: { not: 'before_start' } },
    orderBy: { capturedAt: 'asc' },
    select: { capturedAt: true },
  });
  return gpsGaps(samples.map(s => s.capturedAt), tracking.startTime, tracking.endTime);
}

export function parseBatch(input: unknown, now: number): TelemetrySample[] {
  if (!Array.isArray(input) || input.length > TELEMETRY.MAX_BATCH) throw new TelemetryError(413, 'Batch telemetri terlalu besar/tidak valid');
  if (!input.every(s => validSampleShape(s) && s.capturedAt <= now + TELEMETRY.FUTURE_MS)) {
    throw new TelemetryError(400, 'Sampel telemetri tidak valid atau waktu GPS mendahului server; antrean tetap tersimpan');
  }
  return input.map(({id, capturedAt, lat, lng, accuracy, deviceSpeed}) => ({id, capturedAt, lat, lng, accuracy, deviceSpeed}));
}
// All update/stop writers take this row lock BEFORE reading state. Scope is checked inside the transaction.
type TelemetryTracking = Pick<Tracking, 'id' | 'startTime' | 'telemetryState' | 'telemetryTest' | 'positionCapturedAt' | 'telemetryLoss'>;
export async function lockTracking(tx: Prisma.TransactionClient, id: number, userId: number) {
  await tx.$queryRaw`SELECT id FROM tracking WHERE id = ${id} FOR UPDATE`;
  const tracking = await tx.tracking.findFirst({ where: { id, status: 'started', tugas: { assignedTo: userId, status: 'in_progress' } }, select: {id: true, startTime: true, telemetryState: true, telemetryTest: true, positionCapturedAt: true, telemetryLoss: true} });
  if (!tracking) throw (await forceStoppedError(tx, id, userId)) ?? new TelemetryError(409, 'Sesi tidak aktif atau bukan milik Anda');
  return tracking;
}
export async function ingestBatch(tx: Prisma.TransactionClient, tracking: TelemetryTracking, samples: TelemetrySample[], now: number) {
  let state = (tracking.telemetryState as unknown as SpeedState | null) ?? initialSpeedState();
  const ids = samples.map(s => s.id);
  const existing = await tx.trackingSample.findMany({
    where: { trackingId: tracking.id, OR: [{ sampleId: { in: ids } }, { capturedAt: { in: samples.map(s => new Date(s.capturedAt)) } }] },
    select: { sampleId: true, capturedAt: true },
  });
  const seenIds = new Set(existing.map(s => s.sampleId)), seenTimes = new Set(existing.map(s => s.capturedAt.getTime()));
  const rows: Prisma.TrackingSampleCreateManyInput[] = [];
  const events = new Map<number, SpeedEvent>();
  let position: TelemetrySample | null = null;
  for (const s of [...samples].sort((a, b) => a.capturedAt - b.capturedAt || a.id.localeCompare(b.id))) {
    if (seenIds.has(s.id) || seenTimes.has(s.capturedAt)) continue;
    seenIds.add(s.id); seenTimes.add(s.capturedAt);
    // Offline batches can contribute historical summaries, but never freshen live position.
    const result = s.capturedAt < (tracking.startTime?.getTime() ?? 0)
      ? { state, event: null, quality: 'before_start' }
      : now - s.capturedAt > TELEMETRY.MAX_OFFLINE_MS ? { state, event: null, quality: 'expired' } : advanceSpeed(state, s, s.capturedAt);
    state = result.state;
    rows.push({ trackingId: tracking.id, sampleId: s.id, capturedAt: new Date(s.capturedAt), receivedAt: new Date(now),
      latitude: s.lat, longitude: s.lng, accuracy: s.accuracy, deviceSpeed: s.deviceSpeed, quality: result.quality });
    if (state.position?.id === s.id && now - s.capturedAt <= TELEMETRY.FRESH_MS
      && s.capturedAt > (tracking.positionCapturedAt?.getTime() ?? 0)) position = s;
    if (result.event) events.set(result.event.startAt, result.event);
  }
  for (const e of events.values()) {
    const data = { endAt: new Date(e.endAt), durationMs: e.durationMs, maxKmh: e.maxKmh, meanKmh: e.meanKmh,
      sampleCount: e.sampleCount, worstAccuracy: e.worstAccuracy, isTest: tracking.telemetryTest };
    await tx.speedEvent.upsert({ where: { trackingId_startAt: { trackingId: tracking.id, startAt: new Date(e.startAt) } },
      create: { trackingId: tracking.id, startAt: new Date(e.startAt), ...data }, update: data });
  }
  if (rows.length) {
    await tx.trackingSample.createMany({ data: rows });
    await tx.tracking.update({ where: { id: tracking.id }, data: {
      telemetryState: state as unknown as Prisma.InputJsonValue,
      ...(position ? { endLat: position.lat, endLong: position.lng, positionCapturedAt: new Date(position.capturedAt), positionAccuracy: position.accuracy } : {}),
    } });
  }
  return { acknowledged: ids, state };
}
