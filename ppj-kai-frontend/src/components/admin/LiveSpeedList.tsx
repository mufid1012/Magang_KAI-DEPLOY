'use client';
import { useEffect, useState } from 'react';
import { REVIEW_LABEL, TELEMETRY } from '../../../../shared/telemetry';
import type { LivePosition } from './types';
export default function LiveSpeedList({ positions, error }: { positions: LivePosition[]; error: string }) {
  const [now, setNow] = useState(0);
  useEffect(() => { const tick = () => setNow(Date.now()); tick(); const timer = setInterval(tick,1000); return () => clearInterval(timer); }, []);
  const qualityLabels: Record<string,string> = {device: 'Kecepatan perangkat', coordinates: 'Estimasi koordinat', poor_accuracy: 'GPS lemah', jump: 'Loncatan GPS', gap: 'Data terputus', insufficient: 'Belum cukup data', stale: 'Data kedaluwarsa', unavailable: 'Belum tersedia'};
  return <section className="bg-white/95 p-3 rounded-xl text-xs text-slate-700 max-h-48 overflow-auto shadow" aria-label="Monitoring kecepatan">
    <p className="font-bold">Monitoring kecepatan</p>
    <p className="text-[11px] text-slate-500">Pembaruan dapat terlambat mendekati 20 detik + jaringan. Tidak ada indikasi bukan bukti berjalan kaki.</p>
    {error && <p className="text-amber-700">{error}</p>}
    {positions.map(p => {
      const fresh = p.speedAt !== null && now >= p.speedAt - TELEMETRY.FUTURE_MS && now - p.speedAt <= TELEMETRY.FRESH_MS;
      const weak = p.quality === 'poor_accuracy' || p.quality === 'jump';
      return <div key={p.tugasId} className="border-t mt-2 pt-2">
        <b>{p.petugasNama}</b> · {fresh && p.speedKmh !== null ? p.speedKmh.toFixed(1) : '—'} km/jam {p.isTest && '· Data uji'}
        <p>{weak ? 'GPS lemah — posisi terakhir' : fresh ? `GPS ±${p.accuracy ?? '—'} m` : 'Data kedaluwarsa / belum dapat diukur'} · Posisi: {p.positionCapturedAt ? new Date(p.positionCapturedAt).toLocaleTimeString('id-ID') : 'waktu tidak tersedia'}</p>
        <p>Sampel terakhir: {p.capturedAt ? new Date(p.capturedAt).toLocaleTimeString('id-ID') : '—'} · Kualitas: {qualityLabels[p.quality] ?? p.quality}</p>
        {p.reportedLoss > 0 && <p className="text-amber-700">Riwayat tidak lengkap: {p.reportedLoss} sampel hilang menurut perangkat.</p>}
        {p.reviewCount > 0 && !p.isTest && <p className="text-amber-700">{REVIEW_LABEL}</p>}
      </div>;
    })}
  </section>;
}
