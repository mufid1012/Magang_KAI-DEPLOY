'use client';
import { useEffect, useState } from 'react';

// Fresh = at most three missed polls. Older means the admin is looking at stale positions.
const FRESH_MS = 15000;

export default function LiveStatusBadge({ lastUpdatedAt, error }: { lastUpdatedAt: number | null; error: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const fresh = lastUpdatedAt !== null && now - lastUpdatedAt <= FRESH_MS;
  const dot = error ? 'bg-rose-500' : fresh ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500';
  const label = error ? 'Gagal memperbarui'
    : lastUpdatedAt === null ? 'Memuat posisi...'
    : `Diperbarui ${new Date(lastUpdatedAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
  return (
    <div role="status" className="bg-white/95 backdrop-blur-md rounded-full px-3 py-1.5 shadow-sm border border-slate-200 flex items-center gap-2" title={error || undefined}>
      <span className={`w-2 h-2 rounded-full ${dot}`} />
      <span className="text-slate-600 text-[10px] font-bold tracking-widest uppercase">{label}</span>
    </div>
  );
}
