import { TELEMETRY } from '../../../shared/telemetry';

export class VisiblePoller {
  private stopped = false;
  private running = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private controller: AbortController | null = null;
  private delay: number = TELEMETRY.LIVE_POLL_INTERVAL_MS;
  constructor(private visible: () => boolean, private fetchLive: (signal: AbortSignal) => Promise<void>) {}
  async poll() {
    if (this.stopped || this.running || !this.visible()) return;
    clearTimeout(this.timer); this.running = true; this.controller = new AbortController();
    try { await this.fetchLive(this.controller.signal); this.delay = TELEMETRY.LIVE_POLL_INTERVAL_MS; }
    catch { this.delay = Math.min(this.delay * 2, TELEMETRY.MAX_BACKOFF_MS); }
    finally {
      this.running = false; this.controller = null;
      if (!this.stopped && this.visible()) this.timer = setTimeout(() => { void this.poll(); }, this.delay);
    }
  }
  visibilityChanged() {
    clearTimeout(this.timer);
    if (this.visible()) void this.poll(); else this.controller?.abort();
  }
  stop() { this.stopped = true; clearTimeout(this.timer); this.controller?.abort(); }
}
