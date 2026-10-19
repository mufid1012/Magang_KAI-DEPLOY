'use client';
import { useEffect, useState } from 'react';
import { REVIEW_LABEL, type SpeedSummary } from '../../../../shared/telemetry';
import api from '../../lib/api';
interface Event { id: number; startAt: string; endAt: string; durationMs: number; maxKmh: number; meanKmh: number; sampleCount: number; worstAccuracy: number; isTest: boolean }
export default function TelemetryDetail({ trackingId }: { trackingId: number }) {
  const [summary, setSummary] = useState<SpeedSummary | null>(null), [events, setEvents] = useState<Event[]>([]);
  const [cursor, setCursor] = useState<number | null>(null), [error, setError] = useState(''), [loading, setLoading] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    api.get(`/tracking/${trackingId}/telemetry`, { signal: controller.signal, timeout: 12000 }).then(res => {
      setSummary(res.data.summary); setEvents(res.data.events); setCursor(res.data.nextCursor);
    }).catch(() => { if (!controller.signal.aborted) setError('Ringkasan kecepatan gagal dimuat.'); });
    return () => controller.abort();
  }, [trackingId]);
  const more = async () => {
    if (cursor === null || loading) return;
    setLoading(true);
    try { const res = await api.get(`/tracking/${trackingId}/telemetry`, {params: {cursor}, timeout: 12000}); setEvents(prev => [...prev,...res.data.events]); setCursor(res.data.nextCursor); }
    catch { setError('Kejadian berikutnya gagal dimuat.'); } finally { setLoading(false); }
  };
  return <section className="rounded-xl border p-3 my-3 text-xs text-slate-700">
    <b>Ringkasan kecepatan {summary?.isTest && '· Data uji'}</b>
    <p>Rata-rata segmen valid: {summary?.averageKmh == null ? '—' : summary.averageKmh.toFixed(1)} km/jam · Durasi terukur: {Math.round((summary?.validDurationMs ?? 0)/1000)} detik</p>
    {!!summary?.reportedLoss && <p className="text-amber-700">Riwayat tidak lengkap: perangkat melaporkan {summary.reportedLoss} sampel hilang.</p>}
    <p className="text-slate-500">Data historis tanpa timestamp tidak dapat diukur. Tidak ada indikasi bukan bukti berjalan kaki.</p>
    {events.map(e => <div key={e.id} className="border-t mt-2 pt-2">
      <p className="font-semibold text-amber-700">{e.isTest ? 'Data uji · ' : ''}{REVIEW_LABEL}</p>
      <p>{new Date(e.startAt).toLocaleString('id-ID')} – {new Date(e.endAt).toLocaleTimeString('id-ID')} · {(e.durationMs/1000).toFixed(0)} detik</p>
      <p>Maks {e.maxKmh.toFixed(1)} · Rerata {e.meanKmh.toFixed(1)} km/jam · {e.sampleCount} sampel · Akurasi terburuk ±{e.worstAccuracy.toFixed(0)} m</p>
    </div>)}
    {error && <p>{error}</p>}{cursor !== null && <button disabled={loading} onClick={() => void more()} className="underline mt-2">Muat kejadian berikutnya</button>}
  </section>;
}
