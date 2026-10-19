import { initialSpeedState, TELEMETRY, validSampleShape } from '../../../shared/telemetry';
import type { SpeedState, TelemetrySample } from '../../../shared/telemetry';

export interface QueueSnapshot { samples: TelemetrySample[]; state: SpeedState; selectedAt: number; lost: number }
export interface QueueStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }
export class TelemetryQueue {
  data: QueueSnapshot = { samples: [], state: initialSpeedState(), selectedAt: 0, lost: 0 };
  storageError = false;
  constructor(private key: string, private storage: QueueStorage) {
    try {
      const raw = storage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw) as QueueSnapshot;
        if (!Array.isArray(parsed.samples) || parsed.samples.length > TELEMETRY.MAX_QUEUE || !parsed.samples.every(validSampleShape)
          || !parsed.state || !Array.isArray(parsed.state.window) || !Number.isFinite(parsed.state.lastCapturedAt)
          || !Number.isFinite(parsed.selectedAt) || !Number.isSafeInteger(parsed.lost) || parsed.lost < 0) throw new Error('Queue corrupt');
        this.data = parsed;
      }
    } catch { this.storageError = true; this.data.lost++; }
  }
  save() {
    try { this.storage.setItem(this.key, JSON.stringify(this.data)); this.storageError = false; }
    catch { this.storageError = true; }
  }
  append(sample: TelemetrySample, state: SpeedState) {
    if (sample.capturedAt - this.data.selectedAt < TELEMETRY.TELEMETRY_SAMPLE_INTERVAL_MS) return false;
    this.data.selectedAt = sample.capturedAt; this.data.state = state;
    if (this.data.samples.length >= TELEMETRY.MAX_QUEUE) { this.data.lost++; this.save(); return false; }
    this.data.samples.push(sample); this.save(); return true;
  }
  acknowledge(ids: string[]) {
    const acknowledged = new Set(ids);
    this.data.samples = this.data.samples.filter(s => !acknowledged.has(s.id)); this.save();
  }
}

// A single instance serializes background upload and stop-flush, including slow HTTP requests.
export class TelemetryUploader {
  private flight: Promise<void> | null = null;
  constructor(public queue: TelemetryQueue, private send: (samples: TelemetrySample[]) => Promise<string[]>) {}
  upload(): Promise<void> {
    if (this.flight) return this.flight;
    const batch = this.queue.data.samples.slice(0, TELEMETRY.MAX_BATCH);
    if (!batch.length) return Promise.resolve();
    this.flight = this.send(batch).then(ids => {
      if (!batch.some(s => ids.includes(s.id))) throw new Error('Server belum mengakui sampel');
      this.queue.acknowledge(ids);
    }).finally(() => { this.flight = null; });
    return this.flight;
  }
  async flush(deadline: number) {
    while (this.queue.data.samples.length) {
      if (Date.now() >= deadline) throw new Error('Batas waktu sinkronisasi akhir tercapai');
      await this.upload();
    }
  }
}
