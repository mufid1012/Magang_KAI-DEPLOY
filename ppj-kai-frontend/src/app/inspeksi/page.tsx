'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import api from '../../lib/api';

interface Tugas {
  id: number;
  jalur: string;
  tanggal: string;
  startPointName: string;
  endPointName: string;
  startPointLat: number;
  startPointLong: number;
  endPointLat: number;
  endPointLong: number;
  status: string;
}

const statusLabel: Record<string, string> = {
  pending: 'Menunggu',
  in_progress: 'Sedang Berlangsung',
  completed: 'Selesai',
  cancelled: 'Dibatalkan',
};

const statusIcon: Record<string, string> = {
  pending: 'schedule',
  in_progress: 'directions_railway',
  completed: 'check_circle',
  cancelled: 'cancel',
};

const statusStyle: Record<string, string> = {
  pending: 'bg-amber-500/10 text-amber-600 border-amber-500/30',
  in_progress: 'bg-primary-container/20 text-primary border-primary/30',
  completed: 'bg-green-500/10 text-green-600 border-green-500/30',
  cancelled: 'bg-error-container/20 text-error border-error/30',
};

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function InspeksiIndexPage() {
  const router = useRouter();
  const [tasks, setTasks] = useState<Tugas[]>([]);
  const [loading, setLoading] = useState(true);

  const handleLogout = () => { localStorage.clear(); router.push('/login'); };

  useEffect(() => {
    const fetchTasks = async () => {
      try {
        const res = await api.get('/tugas');
        const allTasks: Tugas[] = res.data.data || [];
        // Filter: hanya tampilkan tugas yang belum selesai/batal
        const activeTasks = allTasks.filter(t => t.status === 'pending' || t.status === 'in_progress');
        setTasks(activeTasks);

        // Jika ada task in_progress, langsung masuk ke tracking-nya
        const inProgress = activeTasks.find(t => t.status === 'in_progress');
        if (inProgress) {
          router.replace(`/inspeksi/${inProgress.id}`);
          return;
        }
      } catch (error) {
        console.error('Error fetching tasks:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchTasks();
  }, [router]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-md text-on-surface-variant">
          <span className="material-symbols-outlined text-primary text-[48px] animate-spin">refresh</span>
          <p className="font-body-md">Memuat tugas inspeksi...</p>
        </div>
      </div>
    );
  }

  // ─── EMPTY STATE: Tidak ada tugas ───
  if (tasks.length === 0) {
    return (
      <div className="bg-background text-on-surface min-h-screen font-body-lg antialiased flex flex-col">
        {/* Header */}
        <header className="bg-surface/80 backdrop-blur-md shadow-sm sticky top-0 z-50 flex items-center justify-between w-full px-container-padding h-16">
          <div className="w-10"></div>
          <h1 className="font-h2 text-h2 font-bold text-primary tracking-tight">Lacak</h1>
          <button onClick={handleLogout} className="w-10 h-10 rounded-full flex items-center justify-center text-on-surface-variant hover:text-error hover:bg-error-container/20 transition-colors" title="Logout">
            <span className="material-symbols-outlined text-[22px]">logout</span>
          </button>
        </header>

        <main className="flex-1 flex flex-col items-center justify-center px-container-padding">
          <div className="flex flex-col items-center text-center max-w-sm">
            {/* Illustration */}
            <div className="w-28 h-28 rounded-full bg-surface-container flex items-center justify-center mb-lg">
              <span className="material-symbols-outlined text-[56px] text-outline">railway_alert</span>
            </div>

            <h2 className="font-h2 text-h2 font-bold text-on-surface mb-sm">Tugas Belum Tersedia</h2>
            <p className="font-body-md text-on-surface-variant mb-xl leading-relaxed">
              Saat ini Anda belum memiliki tugas inspeksi yang ditugaskan. Hubungi admin atau tunggu penugasan baru.
            </p>
          </div>
        </main>
      </div>
    );
  }

  // ─── TASK LIST: Pilih tugas ───
  return (
    <div className="bg-background text-on-surface min-h-screen font-body-lg antialiased">
      {/* Header */}
      <header className="bg-surface/80 backdrop-blur-md shadow-sm sticky top-0 z-50 flex items-center justify-between w-full px-container-padding h-16">
        <div className="w-10"></div>
        <h1 className="font-h2 text-h2 font-bold text-primary tracking-tight">Lacak</h1>
        <button onClick={handleLogout} className="w-10 h-10 rounded-full flex items-center justify-center text-on-surface-variant hover:text-error hover:bg-error-container/20 transition-colors" title="Logout">
          <span className="material-symbols-outlined text-[22px]">logout</span>
        </button>
      </header>

      <main className="max-w-xl mx-auto px-container-padding pt-md pb-32">
        <p className="font-body-md text-on-surface-variant mb-lg">
          Pilih tugas inspeksi yang ingin Anda mulai atau lanjutkan:
        </p>

        <div className="flex flex-col gap-md">
          {tasks.map(tugas => {
            const distance = haversineKm(
              tugas.startPointLat, tugas.startPointLong,
              tugas.endPointLat, tugas.endPointLong
            );

            return (
              <Link
                key={tugas.id}
                href={`/inspeksi/${tugas.id}`}
                className="group relative bg-white/80 backdrop-blur-2xl border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] rounded-[28px] overflow-hidden transition-all duration-300 hover:-translate-y-1.5 flex flex-col"
              >
                {/* Modern Status Gradient Accent */}
                <div className={`absolute top-0 left-0 right-0 h-1.5 ${tugas.status === 'in_progress' ? 'bg-gradient-to-r from-primary to-blue-400' : 'bg-gradient-to-r from-amber-400 to-amber-200'}`} />

                <div className="p-6 flex flex-col gap-6">
                  {/* Title & Status */}
                  <div className="flex justify-between items-start gap-4">
                    <div className="flex-1">
                      <div className="inline-flex items-center gap-1.5 mb-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-pulse" />
                        <span className="text-[10px] font-bold tracking-[0.2em] text-slate-400 uppercase">Tugas Inspeksi</span>
                      </div>
                      <h2 className="font-h2 text-xl font-extrabold text-slate-800 leading-snug tracking-tight group-hover:text-primary transition-colors">{tugas.jalur}</h2>
                    </div>
                    <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-2xl font-label-sm text-[11px] font-bold uppercase shrink-0 transition-colors ${statusStyle[tugas.status] ?? 'bg-surface-container text-on-surface-variant'}`}>
                      <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>{statusIcon[tugas.status]}</span>
                      {statusLabel[tugas.status] ?? tugas.status}
                    </span>
                  </div>

                  {/* Route Timeline */}
                  <div className="bg-slate-50/70 rounded-2xl p-4 border border-slate-100/80 flex items-center gap-4 group-hover:bg-primary/[0.02] transition-colors">
                    <div className="flex flex-col items-center justify-center shrink-0">
                      <div className="w-3 h-3 rounded-full bg-primary ring-4 ring-primary/15 relative z-10" />
                      <div className="w-[2px] h-6 bg-gradient-to-b from-primary/30 to-error/30" />
                      <div className="w-3 h-3 rounded-full bg-error ring-4 ring-error/15 relative z-10" />
                    </div>
                    <div className="flex flex-col justify-between h-[52px] flex-1 py-0.5">
                      <span className="font-body-md text-[15px] font-bold text-slate-700 leading-none">{tugas.startPointName || 'Titik Awal'}</span>
                      <span className="font-body-md text-[15px] font-bold text-slate-700 leading-none">{tugas.endPointName || 'Titik Akhir'}</span>
                    </div>
                    <div className="bg-white px-4 py-3 rounded-2xl shadow-sm border border-slate-100 flex flex-col items-center justify-center shrink-0 min-w-[72px]">
                      <span className="font-data-heavy text-xl text-primary leading-none mb-1">{distance.toFixed(1)}</span>
                      <span className="font-label-sm text-[10px] text-slate-400 font-extrabold uppercase tracking-wider">KM</span>
                    </div>
                  </div>

                  {/* Footer / Meta */}
                  <div className="flex items-center justify-between pt-2">
                    <div className="flex items-center gap-2.5 px-3 py-2 bg-slate-50 rounded-xl border border-slate-100">
                      <div className="w-6 h-6 rounded-md bg-white shadow-sm flex items-center justify-center text-slate-500">
                        <span className="material-symbols-outlined text-[14px]">calendar_month</span>
                      </div>
                      <span className="font-label-sm text-xs font-bold text-slate-600">
                        {new Date(tugas.tanggal).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short' })}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white group-hover:bg-primary rounded-xl font-bold text-sm shadow-md shadow-slate-900/10 group-hover:shadow-primary/25 transition-all duration-300">
                      {tugas.status === 'in_progress' ? 'Lanjutkan' : 'Buka'}
                      <span className="material-symbols-outlined text-[18px] group-hover:translate-x-1 transition-transform duration-300">arrow_forward</span>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </main>
    </div>
  );
}
