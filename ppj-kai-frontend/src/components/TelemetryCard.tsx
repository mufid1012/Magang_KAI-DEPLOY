'use client';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { advanceSpeed, initialSpeedState, speedSummary, TELEMETRY, validSampleShape } from '../../../shared/telemetry';
import type { SpeedState } from '../../../shared/telemetry';
import api from '../lib/api';
import { TelemetryQueue, TelemetryUploader } from '../lib/telemetryQueue';
import type { GPSReading } from '../hooks/useGPS';

export interface TelemetryHandle { flush: () => Promise<{ reportedLoss: number }>; resume: () => void }
interface Props { startedAt: number; trackingId: number; position: GPSReading | null; gpsError: string | null; initialState: SpeedState | null; isTest: boolean }

export const TelemetryCard = forwardRef<TelemetryHandle, Props>(function TelemetryCard({ startedAt, trackingId, position, gpsError, initialState, isTest }, ref) {
  const engine = useRef<SpeedState>(initialState ?? initialSpeedState());
  const queue = useRef<TelemetryQueue | null>(null), uploader = useRef<TelemetryUploader | null>(null);
  const paused = useRef(false);
  const [view, setView] = useState({ now: 0, pending: 0, error: '', offline: false, lost: 0, storageError: false });
  const [wakeStatus, setWakeStatus] = useState('');
  const refresh = () => setView(v => ({ ...v, now: Date.now(), pending: queue.current?.data.samples.length ?? 0,
    offline: !navigator.onLine, lost: queue.current?.data.lost ?? 0, storageError: queue.current?.storageError ?? false }));

  useEffect(() => {
    let disposed = false, timer: ReturnType<typeof setTimeout>, delay: number = TELEMETRY.TRACKING_SYNC_INTERVAL_MS;
    let token: string | null = null;
    try {
      token = localStorage.getItem('token');
      const user = JSON.parse(localStorage.getItem('user') || 'null') as { id?: number } | null;
      if (!user?.id || !token) throw new Error('Akun tidak tersedia');
      const base = new URL(api.defaults.baseURL!, window.location.href).href;
      const q = new TelemetryQueue(`telemetry_v1:${base}:${user.id}:${trackingId}`, localStorage);
      queue.current = q;
      if (q.data.state.lastCapturedAt > engine.current.lastCapturedAt) engine.current = q.data.state;
      uploader.current = new TelemetryUploader(q, async samples => {
        if (disposed || localStorage.getItem('token') !== token) throw new Error('Akun/sesi berubah');
        const res = await api.post(`/tracking/update/${trackingId}`, { samples, reportedLoss: q.data.lost }, { timeout: TELEMETRY.REQUEST_TIMEOUT_MS });
        return res.data.acknowledged;
      });
    } catch { setView(v => ({ ...v, error: 'Penyimpanan telemetri tidak dapat dibuka. Muat ulang setelah memeriksa akun/penyimpanan.' })); }
    const sync = async () => {
      if (disposed) return;
      if (!paused.current && navigator.onLine && uploader.current) {
        try { await uploader.current.upload(); delay = TELEMETRY.TRACKING_SYNC_INTERVAL_MS; if (!disposed) setView(v => ({ ...v, error: '' })); }
        catch { delay = Math.min(delay * 2, TELEMETRY.MAX_BACKOFF_MS); if (!disposed) setView(v => ({ ...v, error: 'Sinkronisasi gagal; sampel belum diakui tetap di antrean.' })); }
      }
      if (!disposed) { refresh(); timer = setTimeout(sync, delay); }
    };
    timer = setTimeout(sync, TELEMETRY.TRACKING_SYNC_INTERVAL_MS);
    const tick = setInterval(refresh, 1000); // Freshness only; never creates a GPS sample.
    window.addEventListener('online', refresh); window.addEventListener('offline', refresh);
    refresh();
    return () => { disposed = true; clearTimeout(timer); clearInterval(tick); window.removeEventListener('online', refresh); window.removeEventListener('offline', refresh); };
  }, [trackingId]);

  useEffect(() => {
    if (!position || position.timestamp < startedAt || paused.current) return;
    const sample = { id: `gps:${Math.trunc(position.timestamp)}`, capturedAt: Math.trunc(position.timestamp),
      lat: position.lat, lng: position.lng, accuracy: position.accuracy, deviceSpeed: position.speed };
    if (!validSampleShape(sample) || sample.capturedAt <= engine.current.lastCapturedAt) return;
    const result = advanceSpeed(engine.current, sample, Date.now());
    engine.current = result.state;
    queue.current?.append(sample, result.state); refresh();
  }, [position, startedAt]);

  useImperativeHandle(ref, () => ({
    async flush() {
      paused.current = true;
      try {
        if (!uploader.current) throw new Error('Antrean belum tersedia');
        await uploader.current.flush(Date.now() + TELEMETRY.STOP_TIMEOUT_MS);
        if (queue.current?.storageError) throw new Error('Penyimpanan bermasalah; periksa lalu coba selesai kembali');
        refresh();
        return { reportedLoss: queue.current?.data.lost ?? 0 };
      } catch (error) { paused.current = false; refresh(); throw error; }
    },
    resume() { paused.current = false; },
  }));

  useEffect(() => {
    let disposed = false, acquiring = false;
    let lock: WakeLockSentinel | null = null;
    const acquire = async () => {
      if (disposed || acquiring || lock || document.visibilityState !== 'visible') return;
      if (!('wakeLock' in navigator)) { setWakeStatus('Wake Lock tidak tersedia'); return; }
      acquiring = true;
      try {
        const next = await navigator.wakeLock.request('screen');
        if (disposed) { await next.release(); return; }
        lock = next; setWakeStatus('Layar dijaga tetap menyala');
        next.addEventListener('release', () => { if (lock === next) lock = null; if (!disposed) setWakeStatus('Wake Lock dilepas browser'); });
      } catch { if (!disposed) setWakeStatus('Wake Lock tidak aktif'); }
      finally { acquiring = false; }
    };
    const visibility = () => { if (document.visibilityState === 'visible') void acquire(); else { void lock?.release(); lock = null; } };
    void acquire(); document.addEventListener('visibilitychange', visibility);
    return () => { disposed = true; document.removeEventListener('visibilitychange', visibility); void lock?.release(); };
  }, []);

  const summary = speedSummary(engine.current, view.now, isTest);
  const reasons: Record<string,string> = { insufficient: 'Belum cukup sampel GPS', stale: 'Data GPS kedaluwarsa / belum tersedia',
    poor_accuracy: 'GPS lemah', jump: 'Loncatan GPS; menunggu data konsisten', gap: 'Tracking terputus; mengumpulkan sampel baru' };
  return <section className="rounded-xl bg-white border border-slate-200 p-3 text-slate-700" aria-label="Kecepatan">
    <div className="flex justify-between items-center"><span className="font-bold text-sm">Kecepatan {isTest && '(data uji)'}</span>
      <span className="text-xl font-bold tabular-nums">{summary.speedKmh === null || gpsError ? '—' : summary.speedKmh.toFixed(1)} <small className="text-xs">km/jam</small></span></div>
    <p className="text-xs mt-1">{gpsError || reasons[engine.current.quality] || (summary.speedKmh === null ? reasons.stale : `Estimasi GPS ±${position?.accuracy.toFixed(0) ?? '—'} m`)}{summary.quality === 'stale' && engine.current.speedAt ? ' · Data kedaluwarsa' : ''}</p>
    <p className="text-xs mt-1">{view.offline ? 'Offline' : 'Online'} · {view.pending ? `${view.pending} sampel belum tersinkron` : 'Antrean tersinkron'}{view.error && ` · ${view.error}`}</p>
    {(view.lost > 0 || view.storageError) && <p className="text-xs text-amber-700">Riwayat mungkin tidak lengkap: {view.lost} sampel tidak tersimpan (jumlah pasti bisa tidak diketahui bila data penyimpanan rusak). {view.storageError && 'Storage gagal; antrean hanya dalam memori hingga penyimpanan pulih.'}</p>}
    <details className="text-[11px] mt-2 text-slate-500"><summary>Lokasi dan kecepatan direkam selama tugas aktif.</summary>Biarkan halaman terbuka. Tracking dapat terputus saat pindah aplikasi atau layar terkunci. {wakeStatus}. Wake Lock tidak menjamin tracking di background.</details>
  </section>;
});
