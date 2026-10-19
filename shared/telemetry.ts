import { haversineMeters } from './geo';

// Initial field-test settings, NOT an official operational standard.
export const TELEMETRY = {
  TELEMETRY_SAMPLE_INTERVAL_MS: 5000, TRACKING_SYNC_INTERVAL_MS: 10000, LIVE_POLL_INTERVAL_MS: 10000,
  MAX_PAYLOAD_BYTES: 65536, WINDOW_BUCKET_MS: 1000, PAIR_MIN_MS: 5000,
  MAX_ACCURACY_M: 20, MAX_REPORTED_ACCURACY_M: 100000, WINDOW_MS: 20000, MIN_WINDOW_MS: 15000, MIN_SAMPLES: 4,
  MAX_GAP_MS: 12000, FRESH_MS: 30000, FUTURE_MS: 5000, MAX_OFFLINE_MS: 86400000,
  MAX_SPEED_MPS: 55, DEVICE_TOLERANCE_MPS: 0.75, SMOOTHING_ALPHA: 0.5,
  REVIEW_KMH: 12, REVIEW_DURATION_MS: 60000, MAX_BATCH: 120, MAX_QUEUE: 1440,
  REQUEST_TIMEOUT_MS: 15000, MAX_BACKOFF_MS: 60000, STOP_TIMEOUT_MS: 45000,
} as const;
export const REVIEW_LABEL = 'Kecepatan tidak wajar — perlu ditinjau';
export interface TelemetrySample {
  id: string; capturedAt: number; lat: number; lng: number; accuracy: number; deviceSpeed: number | null;
}
export interface SpeedEvent {
  startAt: number; endAt: number; durationMs: number; maxKmh: number; meanKmh: number;
  sampleCount: number; worstAccuracy: number;
}
export interface SpeedState {
  lastCapturedAt: number; window: TelemetrySample[]; anchor: TelemetrySample | null;
  speedKmh: number | null; speedAt: number | null; quality: string;
  distanceM: number; durationMs: number; streak: SpeedEvent | null;
  reviewCount: number; position: TelemetrySample | null;
}
export function initialSpeedState(): SpeedState {
  return { lastCapturedAt: 0, window: [], anchor: null, speedKmh: null, speedAt: null,
    quality: 'insufficient', distanceM: 0, durationMs: 0, streak: null, reviewCount: 0, position: null };
}
export function validSampleShape(s: unknown): s is TelemetrySample {
  if (!s || typeof s !== 'object') return false;
  const p = s as TelemetrySample;
  return typeof p.id === 'string' && /^[a-zA-Z0-9:_-]{1,80}$/.test(p.id)
    && [p.capturedAt, p.lat, p.lng, p.accuracy].every(v => typeof v === 'number' && Number.isFinite(v))
    && Number.isSafeInteger(p.capturedAt) && p.capturedAt > 0 && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180
    && p.accuracy >= 0 && p.accuracy <= TELEMETRY.MAX_REPORTED_ACCURACY_M
    && (p.deviceSpeed === null || (typeof p.deviceSpeed === 'number' && Number.isFinite(p.deviceSpeed)));
}
const distance = (a: TelemetrySample, b: TelemetrySample) => haversineMeters(a.lat, a.lng, b.lat, b.lng);
export function advanceSpeed(previous: SpeedState, sample: TelemetrySample, now = sample.capturedAt): { state: SpeedState; event: SpeedEvent | null; quality: string } {
  if (!validSampleShape(sample)) return { state: previous, event: null, quality: 'invalid' };
  if (sample.capturedAt <= previous.lastCapturedAt) return { state: previous, event: null, quality: 'late' };
  const state: SpeedState = { ...previous, window: [...previous.window], streak: previous.streak ? { ...previous.streak } : null };
  const gap = previous.lastCapturedAt > 0 && sample.capturedAt - previous.lastCapturedAt > TELEMETRY.MAX_GAP_MS;
  state.lastCapturedAt = sample.capturedAt;
  const clear = (quality: string) => {
    state.window = []; state.anchor = null; state.speedKmh = null; state.speedAt = null; state.streak = null; state.quality = quality;
    return { state, event: null, quality };
  };
  if (sample.capturedAt > now + TELEMETRY.FUTURE_MS || now - sample.capturedAt > TELEMETRY.FRESH_MS) return clear('stale');
  if (sample.accuracy > TELEMETRY.MAX_ACCURACY_M) return clear('poor_accuracy');
  if (gap) { state.window = []; state.anchor = null; state.speedKmh = null; state.streak = null; }
  const last = state.window.at(-1);
  if (last && Math.max(0, distance(last, sample) - last.accuracy - sample.accuracy) / ((sample.capturedAt - last.capturedAt) / 1000) > TELEMETRY.MAX_SPEED_MPS) {
    return clear('jump'); // Quarantine the point; a second point cannot connect across it.
  }
  state.position = sample;
  state.window = [...state.window.filter(p => sample.capturedAt - p.capturedAt <= TELEMETRY.WINDOW_MS && Math.floor(p.capturedAt / TELEMETRY.WINDOW_BUCKET_MS) !== Math.floor(sample.capturedAt / TELEMETRY.WINDOW_BUCKET_MS)), sample];
  if (!state.anchor) state.anchor = sample;
  const first = state.window[0]!, dt = (sample.capturedAt - first.capturedAt) / 1000;
  if (state.window.length < TELEMETRY.MIN_SAMPLES || dt * 1000 < TELEMETRY.MIN_WINDOW_MS) {
    state.speedKmh = null; state.speedAt = null; state.streak = null; state.quality = gap ? 'gap' : 'insufficient';
    return { state, event: null, quality: state.quality };
  }
  // Net displacement avoids adding jitter. Uncertainty is a dead band, then conservatively subtracted.
  const displacement = distance(first, sample), uncertainty = first.accuracy + sample.accuracy;
  // Cap the endpoint estimate by a robust slope. A lone endpoint spike must not
  // become measured travel simply because it is below the physical jump ceiling.
  const slopes: number[] = [];
  for (let i = 0; i < state.window.length; i++) for (let j = i + 1; j < state.window.length; j++) {
    const a = state.window[i]!, b = state.window[j]!, span = b.capturedAt - a.capturedAt;
    if (span >= TELEMETRY.PAIR_MIN_MS) slopes.push(distance(a,b) / (span / 1000));
  }
  slopes.sort((a,b) => a-b);
  const robustMps = slopes[Math.floor((slopes.length - 1) / 2)] ?? 0;
  const coordinateMps = Math.min(Math.max(0, displacement - uncertainty) / dt, robustMps);
  const device = sample.deviceSpeed;
  const deviceOK = device !== null && device >= 0 && device <= TELEMETRY.MAX_SPEED_MPS
    && Math.abs(device - robustMps) <= uncertainty / dt + TELEMETRY.DEVICE_TOLERANCE_MPS;
  const rawKmh = (deviceOK ? device : coordinateMps) * 3.6;
  state.speedKmh = previous.speedKmh === null || gap ? rawKmh
    : previous.speedKmh + TELEMETRY.SMOOTHING_ALPHA * (rawKmh - previous.speedKmh);
  // A stop should not remain a fast speed merely because of the smoothing tail.
  if (rawKmh === 0) state.speedKmh = 0;
  state.speedAt = sample.capturedAt; state.quality = deviceOK ? 'device' : 'coordinates';
  const anchorDt = sample.capturedAt - state.anchor.capturedAt;
  if (anchorDt >= TELEMETRY.MIN_WINDOW_MS) {
    state.distanceM += Math.min(Math.max(0, distance(state.anchor, sample) - state.anchor.accuracy - sample.accuracy), robustMps * anchorDt / 1000);
    state.durationMs += anchorDt; state.anchor = sample;
  }
  const windowAccuracy = Math.max(...state.window.map(p => p.accuracy));
  let event: SpeedEvent | null = null;
  // Both raw and smoothed values must exceed the threshold; bad data breaks continuity.
  if (rawKmh > TELEMETRY.REVIEW_KMH && coordinateMps * 3.6 > TELEMETRY.REVIEW_KMH && state.speedKmh > TELEMETRY.REVIEW_KMH) {
    const streak = state.streak;
    if (!streak) state.streak = { startAt: sample.capturedAt, endAt: sample.capturedAt, durationMs: 0,
      maxKmh: state.speedKmh, meanKmh: state.speedKmh, sampleCount: 1, worstAccuracy: windowAccuracy };
    else {
      const delta = sample.capturedAt - streak.endAt;
      streak.meanKmh = (streak.meanKmh * streak.durationMs + state.speedKmh * delta) / (streak.durationMs + delta);
      streak.endAt = sample.capturedAt; streak.durationMs += delta; streak.sampleCount++;
      streak.maxKmh = Math.max(streak.maxKmh, state.speedKmh); streak.worstAccuracy = Math.max(streak.worstAccuracy, windowAccuracy);
      if (streak.durationMs >= TELEMETRY.REVIEW_DURATION_MS) {
        if (streak.durationMs - delta < TELEMETRY.REVIEW_DURATION_MS) state.reviewCount++;
        event = { ...streak };
      }
    }
  } else state.streak = null;
  return { state, event, quality: state.quality };
}
export function speedSummary(state: SpeedState | null | undefined, now: number, isTest = false, reportedLoss = 0) {
  const fresh = !!state?.speedAt && now - state.speedAt <= TELEMETRY.FRESH_MS && now >= state.speedAt - TELEMETRY.FUTURE_MS;
  return { speedKmh: fresh ? state!.speedKmh : null, speedAt: state?.speedAt ?? null,
    capturedAt: state?.lastCapturedAt || null, positionCapturedAt: state?.position?.capturedAt ?? null,
    accuracy: state?.position?.accuracy ?? null, quality: !state ? 'unavailable' : now - state.lastCapturedAt <= TELEMETRY.FRESH_MS ? state.quality : 'stale',
    averageKmh: state?.durationMs ? state.distanceM / (state.durationMs / 1000) * 3.6 : null,
    distanceM: state?.distanceM ?? 0, validDurationMs: state?.durationMs ?? 0,
    reviewCount: isTest ? 0 : state?.reviewCount ?? 0, isTest, reportedLoss };
}
export type SpeedSummary = ReturnType<typeof speedSummary>;
