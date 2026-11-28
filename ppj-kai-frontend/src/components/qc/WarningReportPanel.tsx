'use client';
import { useCallback, useEffect, useState } from 'react';
import api from '../../lib/api';

interface Person { nama: string; nipp: string }
export interface WarningReport {
  id: number; createdAt: string; startPointName: string | null; endPointName: string | null;
  latitude: number; longitude: number; creator: Person; jalur: string | null; recipients: Person[];
}

const PERIODS = [{ days: 1, label: 'Hari ini' }, { days: 7, label: '7 hari' }, { days: 30, label: '30 hari' }] as const;
const when = (iso: string) => new Date(iso).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' }) + ' WIB';

/** Riwayat Alert Kereta antar PPJ pada stasiun wilayah QC (read-only). */
export default function WarningReportPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [days, setDays] = useState<number>(7);
  const [rows, setRows] = useState<WarningReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setRows((await api.get('/admin/warnings', { params: { days }, timeout: 12000 })).data.data); }
    catch { setError('Laporan warning gagal dimuat.'); }
    finally { setLoading(false); }
  }, [days]);
  useEffect(() => { if (open) void load(); }, [open, load]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[1100] flex justify-end bg-slate-900/30" onClick={onClose}>
      <aside role="dialog" aria-modal="true" aria-labelledby="warning-report-title" onClick={e => e.stopPropagation()}
        className="h-full w-full sm:w-[420px] bg-white shadow-2xl flex flex-col">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <h2 id="warning-report-title" className="font-extrabold text-slate-800 text-sm flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px] text-blue-600">campaign</span> Laporan Warning PPJ
          </h2>
          <button onClick={onClose} aria-label="Tutup" className="text-slate-400 hover:text-slate-700"><span className="material-symbols-outlined">close</span></button>
        </div>
        <div className="px-4 py-2 flex gap-2 border-b border-slate-100">
          {PERIODS.map(p => (
            <button key={p.days} onClick={() => setDays(p.days)} aria-pressed={days === p.days}
              className={`px-3 py-1 rounded-full text-xs font-bold ${days === p.days ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}>{p.label}</button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
          {loading && <p className="text-xs text-slate-500">Memuat…</p>}
          {error && <p className="text-xs text-rose-600">{error} <button onClick={() => void load()} className="underline font-bold">Coba lagi</button></p>}
          {!loading && !error && rows.length === 0 && <p className="text-xs text-slate-500">Tidak ada warning pada periode ini.</p>}
          {rows.map(w => (
            <article key={w.id} className="rounded-xl border border-slate-200 p-3 text-xs text-slate-700">
              <div className="flex justify-between gap-2">
                <b className="text-slate-800">{w.creator.nama}</b>
                <span className="text-slate-500 shrink-0">{when(w.createdAt)}</span>
              </div>
              <p className="text-slate-500">NIPP {w.creator.nipp}{w.jalur ? ` · ${w.jalur}` : ''}</p>
              <p className="mt-1">Kereta dari arah <b>{w.endPointName ?? '—'}</b> (jalur {w.startPointName ?? '—'} → {w.endPointName ?? '—'})</p>
              <p className="mt-1">Diterima {w.recipients.length} PPJ{w.recipients.length ? `: ${w.recipients.map(r => r.nama).join(', ')}` : ''}</p>
            </article>
          ))}
        </div>
      </aside>
    </div>
  );
}
