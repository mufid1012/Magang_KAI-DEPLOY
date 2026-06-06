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
                className="bg-surface-container-lowest rounded-2xl border border-outline-variant shadow-sm overflow-hidden active:scale-[0.98] transition-transform duration-150 group"
              >
                {/* Status bar accent */}
                <div className={`h-1 ${tugas.status === 'in_progress' ? 'bg-primary' : 'bg-amber-400'}`} />

                <div className="p-md flex flex-col gap-sm">
                  {/* Title + Status */}
                  <div className="flex justify-between items-start gap-sm">
                    <h2 className="font-data-heavy text-data-heavy text-on-surface flex-1 leading-snug">{tugas.jalur}</h2>
                    <span className={`flex items-center gap-1 px-sm py-xs rounded-full font-label-sm text-[10px] uppercase border whitespace-nowrap shrink-0 ${statusStyle[tugas.status] ?? 'bg-surface-container text-on-surface-variant'}`}>
                      <span className="material-symbols-outlined text-[12px]">{statusIcon[tugas.status]}</span>
                      {statusLabel[tugas.status] ?? tugas.status}
                    </span>
                  </div>

                  {/* Route */}
                  <div className="flex items-center gap-xs">
                    <div className="flex flex-col items-center gap-0.5">
                      <div className="w-2 h-2 rounded-full bg-primary border-2 border-primary/30" />
                      <div className="w-px h-3 bg-outline-variant" />
                      <div className="w-2 h-2 rounded-full bg-error border-2 border-error/30" />
                    </div>
                    <div className="flex flex-col gap-0.5 ml-sm">
                      <span className="font-label-sm text-label-sm text-on-surface">{tugas.startPointName || 'Titik Awal'}</span>
                      <span className="font-label-sm text-label-sm text-on-surface-variant">{tugas.endPointName || 'Titik Akhir'}</span>
                    </div>
                  </div>

                  {/* Meta row */}
                  <div className="flex items-center gap-lg mt-xs pt-sm border-t border-outline-variant/50">
                    <span className="flex items-center gap-1 font-label-sm text-label-sm text-on-surface-variant">
                      <span className="material-symbols-outlined text-[14px]">straighten</span>
                      {distance.toFixed(1)} km
                    </span>
                    <span className="flex items-center gap-1 font-label-sm text-label-sm text-on-surface-variant">
                      <span className="material-symbols-outlined text-[14px]">calendar_today</span>
                      {new Date(tugas.tanggal).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' })}
                    </span>
                    <span className="flex items-center gap-1 font-label-sm text-label-sm text-primary font-semibold ml-auto group-hover:translate-x-0.5 transition-transform">
                      Buka
                      <span className="material-symbols-outlined text-[16px]">chevron_right</span>
                    </span>
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
