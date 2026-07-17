'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import api from '../../lib/api';

const DynamicMap = dynamic(() => import('../../components/map/DynamicMap'), { ssr: false });

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
  jamMulai: string | null;
  jamSelesai: string | null;
  status: string;
  tracking?: {
    id: number;
    startTime: string | null;
    endTime: string | null;
    durasi: number | null;
    status: string;
    routePath: string | null;
  }[];
}

interface TugasDetail {
  id: number;
  jalur: string;
  tanggal: string;
  startPointLat: number;
  startPointLong: number;
  endPointLat: number;
  endPointLong: number;
  startPointName: string;
  endPointName: string;
  status: string;
  tracking: {
    id: number;
    startTime: string | null;
    endTime: string | null;
    durasi: number | null;
    status: string;
    routePath: string | null;
    laporan: { id: number }[];
  }[];
}

const statusLabel: Record<string, string> = {
  pending: 'Menunggu',
  in_progress: 'Sedang Berlangsung',
  completed: 'Selesai',
  cancelled: 'Dibatalkan',
  missed: 'Tidak Selesai',
};

const statusIcon: Record<string, string> = {
  pending: 'schedule',
  in_progress: 'directions_railway',
  completed: 'check_circle',
  cancelled: 'cancel',
  missed: 'event_busy',
};

const statusStyle: Record<string, string> = {
  pending: 'bg-amber-500/10 text-amber-600 border-amber-500/30',
  in_progress: 'bg-primary-container/20 text-primary border-primary/30',
  completed: 'bg-green-500/10 text-green-600 border-green-500/30',
  cancelled: 'bg-error-container/20 text-error border-error/30',
  missed: 'bg-rose-500/10 text-rose-600 border-rose-500/30',
};

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDuration(detik: number | null) {
  if (!detik) return '-';
  const h = Math.floor(detik / 3600);
  const m = Math.floor((detik % 3600) / 60);
  if (h > 0) return `${h}j ${m}m`;
  if (m > 0) return `${m} menit`;
  return `${detik} detik`;
}

function formatTime(dateStr: string | null) {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

export default function InspeksiIndexPage() {
  const router = useRouter();
  const [tasks, setTasks] = useState<Tugas[]>([]);
  const [completedTasks, setCompletedTasks] = useState<Tugas[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'tugas' | 'riwayat'>('tugas');
  const [selectedDetail, setSelectedDetail] = useState<TugasDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const handleLogout = () => { localStorage.clear(); router.push('/login'); };

  const handleOpenDetail = async (tugasId: number) => {
    setLoadingDetail(true);
    try {
      const res = await api.get(`/tugas/${tugasId}`);
      setSelectedDetail(res.data.data);
    } catch (err) {
      console.error('Error fetching detail:', err);
    } finally {
      setLoadingDetail(false);
    }
  };

  useEffect(() => {
    const fetchTasks = async () => {
      try {
        const res = await api.get('/tugas');
        const allTasks: Tugas[] = res.data.data || [];
        // Filter: tugas aktif dan tugas selesai (riwayat)
        const activeTasks = allTasks.filter(t => t.status === 'pending' || t.status === 'in_progress' || t.status === 'missed');
        const completed = allTasks.filter(t => t.status === 'completed');
        setCompletedTasks(completed);

        const getJadwalTime = (t: Tugas) => {
          if (!t.tanggal || !t.jamMulai) return 0;
          const jadwal = new Date(t.tanggal);
          const [hh, mm] = t.jamMulai.split(':');
          jadwal.setHours(parseInt(hh, 10), parseInt(mm, 10), 0, 0);
          return jadwal.getTime();
        };

        const now = Date.now();
        activeTasks.sort((a, b) => {
          const timeA = getJadwalTime(a);
          const timeB = getJadwalTime(b);

          const isA_Ready = timeA <= now;
          const isB_Ready = timeB <= now;

          if (isA_Ready && !isB_Ready) return -1;
          if (!isA_Ready && isB_Ready) return 1;

          // Jika keduanya ready atau keduanya belum ready, urutkan dari waktu terdekat (terawal)
          return timeA - timeB;
        });

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

  // ─── EMPTY STATE: Tidak ada tugas & riwayat ───
  if (tasks.length === 0 && completedTasks.length === 0) {
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
        {/* Tab Bar */}
        <div className="flex gap-1.5 mb-lg bg-slate-100/80 rounded-2xl p-1.5 shadow-inner">
          <button
            onClick={() => setActiveTab('tugas')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-label-sm text-label-sm font-bold transition-all duration-300 ${
              activeTab === 'tugas'
                ? 'bg-white text-primary shadow-md'
                : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]" style={activeTab === 'tugas' ? { fontVariationSettings: "'FILL' 1" } : undefined}>assignment</span>
            Tugas ({tasks.length})
          </button>
          <button
            onClick={() => setActiveTab('riwayat')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-label-sm text-label-sm font-bold transition-all duration-300 ${
              activeTab === 'riwayat'
                ? 'bg-white text-primary shadow-md'
                : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]" style={activeTab === 'riwayat' ? { fontVariationSettings: "'FILL' 1" } : undefined}>history</span>
            Riwayat ({completedTasks.length})
          </button>
        </div>

        {/* Tab Tugas */}
        {activeTab === 'tugas' && (
          tasks.length > 0 ? (
            <>
            <p className="font-body-md text-on-surface-variant mb-lg">
              Pilih tugas inspeksi yang ingin Anda mulai atau lanjutkan:
            </p>
            <div className="flex flex-col gap-md">
          {tasks.map(tugas => {
            const distance = haversineKm(
              tugas.startPointLat, tugas.startPointLong,
              tugas.endPointLat, tugas.endPointLong
            );

          // Time-window: 1 hour before jam_mulai to 1 hour after jam_mulai
          let isBelumWaktunya = false;
          let isTerlewat = tugas.status === 'missed';
          let windowOpenTimeStr = '';
          if (tugas.tanggal && tugas.jamMulai && tugas.status !== 'missed') {
            const [hh, mm] = tugas.jamMulai.split(':').map(Number);
            const tugasDate = new Date(tugas.tanggal);
            // Build scheduled time — tanggal from API is UTC midnight, jam_mulai is WIB
            const scheduledTimeUTC = new Date(Date.UTC(
              tugasDate.getUTCFullYear(),
              tugasDate.getUTCMonth(),
              tugasDate.getUTCDate(),
              hh - 7, // WIB to UTC
              mm
            ));
            const windowStart = new Date(scheduledTimeUTC.getTime() - 60 * 60 * 1000); // 1hr before
            const windowEnd = new Date(scheduledTimeUTC.getTime() + 60 * 60 * 1000);   // 1hr after
            const now = new Date();

            if (now < windowStart) {
              isBelumWaktunya = true;
              const wsWIB = new Date(windowStart.getTime() + 7 * 60 * 60 * 1000);
              windowOpenTimeStr = wsWIB.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false });
            } else if (now > windowEnd) {
              isTerlewat = true;
            }
          }

          const isDisabled = isBelumWaktunya || isTerlewat;
          const CardContainer = isDisabled ? 'div' : Link;

          return (
            <CardContainer
              key={tugas.id}
              href={isDisabled ? '#' : `/inspeksi/${tugas.id}`}
              className={`group relative bg-white/80 backdrop-blur-2xl border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-[28px] overflow-hidden flex flex-col ${
                isDisabled
                  ? 'opacity-70 grayscale-[0.3] cursor-not-allowed'
                  : 'hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition-all duration-300 hover:-translate-y-1.5'
              }`}
            >
              {/* Modern Status Gradient Accent */}
              <div className={`absolute top-0 left-0 right-0 h-1.5 ${
                tugas.status === 'in_progress' ? 'bg-gradient-to-r from-primary to-blue-400'
                : isTerlewat ? 'bg-gradient-to-r from-rose-400 to-rose-200'
                : isBelumWaktunya ? 'bg-slate-300'
                : 'bg-gradient-to-r from-amber-400 to-amber-200'
              }`} />

              <div className="p-6 flex flex-col gap-6">
                {/* Title & Status */}
                <div className="flex justify-between items-start gap-4">
                  <div className="flex-1">
                    <div className="inline-flex items-center gap-1.5 mb-2">
                      {!isDisabled && <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-pulse" />}
                      <span className="text-[10px] font-bold tracking-[0.2em] text-slate-400 uppercase">Tugas Inspeksi</span>
                    </div>
                    <h2 className={`font-h2 text-xl font-extrabold leading-snug tracking-tight transition-colors ${
                      isDisabled ? 'text-slate-500' : 'text-slate-800 group-hover:text-primary'
                    }`}>{tugas.jalur}</h2>
                  </div>
                  <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-2xl font-label-sm text-[11px] font-bold uppercase shrink-0 transition-colors ${
                    isBelumWaktunya ? 'bg-slate-100 text-slate-400'
                    : isTerlewat ? (statusStyle['missed'] ?? 'bg-rose-500/10 text-rose-600')
                    : (statusStyle[tugas.status] ?? 'bg-surface-container text-on-surface-variant')
                  }`}>
                    <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                      {isBelumWaktunya ? 'lock_clock' : isTerlewat ? 'event_busy' : statusIcon[tugas.status]}
                    </span>
                    {isBelumWaktunya ? 'Belum Waktunya' : isTerlewat ? 'Tidak Selesai' : (statusLabel[tugas.status] ?? tugas.status)}
                  </span>
                </div>

                {/* Route Timeline */}
                <div className={`bg-slate-50/70 rounded-2xl p-4 border border-slate-100/80 flex items-center gap-4 transition-colors ${isDisabled ? '' : 'group-hover:bg-primary/[0.02]'}`}>
                  <div className="flex flex-col items-center justify-center shrink-0">
                    <div className={`w-3 h-3 rounded-full relative z-10 ${isDisabled ? 'bg-slate-300' : 'bg-primary ring-4 ring-primary/15'}`} />
                    <div className={`w-[2px] h-6 ${isDisabled ? 'bg-slate-200' : 'bg-gradient-to-b from-primary/30 to-error/30'}`} />
                    <div className={`w-3 h-3 rounded-full relative z-10 ${isDisabled ? 'bg-slate-300' : 'bg-error ring-4 ring-error/15'}`} />
                  </div>
                  <div className="flex flex-col justify-between h-[52px] flex-1 py-0.5">
                    <span className={`font-body-md text-[15px] font-bold leading-none ${isDisabled ? 'text-slate-400' : 'text-slate-700'}`}>{tugas.startPointName || 'Titik Awal'}</span>
                    <span className={`font-body-md text-[15px] font-bold leading-none ${isDisabled ? 'text-slate-400' : 'text-slate-700'}`}>{tugas.endPointName || 'Titik Akhir'}</span>
                  </div>
                  <div className="bg-white px-4 py-3 rounded-2xl shadow-sm border border-slate-100 flex flex-col items-center justify-center shrink-0 min-w-[72px]">
                    <span className={`font-data-heavy text-xl leading-none mb-1 ${isDisabled ? 'text-slate-400' : 'text-primary'}`}>{distance.toFixed(1)}</span>
                    <span className="font-label-sm text-[10px] text-slate-400 font-extrabold uppercase tracking-wider">KM</span>
                  </div>
                </div>

                {/* Footer / Meta */}
                <div className="flex items-center justify-between pt-2">
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2.5 px-3 py-2 bg-slate-50 rounded-xl border border-slate-100 mb-1">
                      <div className="w-6 h-6 rounded-md bg-white shadow-sm flex items-center justify-center text-slate-500">
                        <span className="material-symbols-outlined text-[14px]">calendar_month</span>
                      </div>
                      <span className="font-label-sm text-xs font-bold text-slate-600">
                        {new Date(tugas.tanggal).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short' })}
                      </span>
                    </div>
                    {(tugas.jamMulai || tugas.jamSelesai) && (
                      <span className="text-[10px] font-bold text-slate-400 ml-1">
                        Jam: {tugas.jamMulai ?? '--:--'} - {tugas.jamSelesai ?? '--:--'}
                      </span>
                    )}
                  </div>

                  <div className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm shadow-md transition-all duration-300 ${
                    isDisabled
                      ? isTerlewat ? 'bg-rose-100 text-rose-500 shadow-none' : 'bg-slate-200 text-slate-500 shadow-none'
                      : 'bg-slate-900 text-white group-hover:bg-primary shadow-slate-900/10 group-hover:shadow-primary/25'
                  }`}>
                    {isBelumWaktunya ? `Dibuka ${windowOpenTimeStr}` : isTerlewat ? 'Terlewat' : (tugas.status === 'in_progress' ? 'Lanjutkan' : 'Buka')}
                    {!isDisabled && (
                      <span className="material-symbols-outlined text-[18px] group-hover:translate-x-1 transition-transform duration-300">arrow_forward</span>
                    )}
                  </div>
                </div>
              </div>
            </CardContainer>
          );
          })}
            </div>
            </>
          ) : (
            <div className="flex flex-col items-center text-center py-16">
              <div className="w-20 h-20 rounded-full bg-slate-100 flex items-center justify-center mb-lg">
                <span className="material-symbols-outlined text-[40px] text-slate-300">assignment</span>
              </div>
              <h3 className="font-h3 text-h3 font-bold text-slate-400 mb-sm">Tidak Ada Tugas Aktif</h3>
              <p className="font-body-md text-slate-400 max-w-xs">Saat ini tidak ada tugas inspeksi yang perlu dilakukan.</p>
            </div>
          )
        )}

        {/* Tab Riwayat */}
        {activeTab === 'riwayat' && (
          completedTasks.length > 0 ? (
            <div className="flex flex-col gap-md">
              {completedTasks.map(tugas => {
                const distance = haversineKm(
                  tugas.startPointLat, tugas.startPointLong,
                  tugas.endPointLat, tugas.endPointLong
                );
                const latestTracking = tugas.tracking?.[0];

                return (
                  <div
                    key={tugas.id}
                    className="group relative bg-white/80 backdrop-blur-2xl border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-[28px] overflow-hidden flex flex-col hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition-all duration-300"
                  >
                    {/* Green accent for completed */}
                    <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-green-500 to-emerald-300" />

                    <div className="p-6 flex flex-col gap-5">
                      {/* Title & Status */}
                      <div className="flex justify-between items-start gap-4">
                        <div className="flex-1">
                          <div className="inline-flex items-center gap-1.5 mb-2">
                            <span className="material-symbols-outlined text-[14px] text-green-500" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                            <span className="text-[10px] font-bold tracking-[0.2em] text-slate-400 uppercase">Riwayat Inspeksi</span>
                          </div>
                          <h2 className="font-h2 text-xl font-extrabold leading-snug tracking-tight text-slate-800">{tugas.jalur}</h2>
                        </div>
                        <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl font-label-sm text-[11px] font-bold uppercase shrink-0 bg-green-500/10 text-green-600 border border-green-500/30">
                          <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                          Selesai
                        </span>
                      </div>

                      {/* Route Timeline */}
                      <div className="bg-slate-50/70 rounded-2xl p-4 border border-slate-100/80 flex items-center gap-4">
                        <div className="flex flex-col items-center justify-center shrink-0">
                          <div className="w-3 h-3 rounded-full bg-green-500 ring-4 ring-green-500/15 relative z-10" />
                          <div className="w-[2px] h-6 bg-gradient-to-b from-green-500/30 to-slate-300/30" />
                          <div className="w-3 h-3 rounded-full bg-slate-500 ring-4 ring-slate-500/15 relative z-10" />
                        </div>
                        <div className="flex flex-col justify-between h-[52px] flex-1 py-0.5">
                          <span className="font-body-md text-[15px] font-bold leading-none text-slate-700">{tugas.startPointName || 'Titik Awal'}</span>
                          <span className="font-body-md text-[15px] font-bold leading-none text-slate-700">{tugas.endPointName || 'Titik Akhir'}</span>
                        </div>
                        <div className="bg-white px-4 py-3 rounded-2xl shadow-sm border border-slate-100 flex flex-col items-center justify-center shrink-0 min-w-[72px]">
                          <span className="font-data-heavy text-xl leading-none mb-1 text-green-600">{distance.toFixed(1)}</span>
                          <span className="font-label-sm text-[10px] text-slate-400 font-extrabold uppercase tracking-wider">KM</span>
                        </div>
                      </div>

                      {/* Meta + Selengkapnya */}
                      <div className="flex items-center justify-between pt-1">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2.5 px-3 py-2 bg-slate-50 rounded-xl border border-slate-100">
                            <div className="w-6 h-6 rounded-md bg-white shadow-sm flex items-center justify-center text-slate-500">
                              <span className="material-symbols-outlined text-[14px]">calendar_month</span>
                            </div>
                            <span className="font-label-sm text-xs font-bold text-slate-600">
                              {new Date(tugas.tanggal).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short' })}
                            </span>
                          </div>
                          {latestTracking?.durasi && (
                            <div className="flex items-center gap-1.5 ml-1">
                              <span className="material-symbols-outlined text-[14px] text-slate-400">schedule</span>
                              <span className="text-[11px] font-bold text-slate-400">{formatDuration(latestTracking.durasi)}</span>
                            </div>
                          )}
                        </div>

                        <button
                          onClick={() => handleOpenDetail(tugas.id)}
                          className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm shadow-md transition-all duration-300 bg-slate-900 text-white hover:bg-primary shadow-slate-900/10 hover:shadow-primary/25"
                        >
                          Selengkapnya
                          <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center text-center py-16">
              <div className="w-20 h-20 rounded-full bg-slate-100 flex items-center justify-center mb-lg">
                <span className="material-symbols-outlined text-[40px] text-slate-300">history</span>
              </div>
              <h3 className="font-h3 text-h3 font-bold text-slate-400 mb-sm">Belum Ada Riwayat</h3>
              <p className="font-body-md text-slate-400 max-w-xs">Riwayat perjalanan inspeksi yang sudah selesai akan muncul di sini.</p>
            </div>
          )
        )}
      </main>

      {/* Detail Modal */}
      {selectedDetail && (() => {
        const trk = selectedDetail.tracking?.[0];
        let trackPath: [number, number][] = [];
        if (trk?.routePath) {
          try {
            const parsed = JSON.parse(trk.routePath);
            if (Array.isArray(parsed) && parsed.length > 0) trackPath = parsed;
          } catch { /* ignore */ }
        }
        const totalKm = trackPath.reduce((sum, point, i) => {
          if (i === 0) return 0;
          return sum + haversineKm(trackPath[i - 1][0], trackPath[i - 1][1], point[0], point[1]);
        }, 0).toFixed(2);
        const mapCenter = trackPath.length > 0
          ? { lat: trackPath[Math.floor(trackPath.length / 2)][0], lng: trackPath[Math.floor(trackPath.length / 2)][1] }
          : { lat: selectedDetail.startPointLat, lng: selectedDetail.startPointLong };

        return (
          <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center" onClick={() => setSelectedDetail(null)}>
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
            <div
              className="relative w-full max-w-lg max-h-[92vh] bg-white rounded-t-[28px] sm:rounded-[28px] overflow-hidden shadow-2xl flex flex-col"
              onClick={e => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between p-6 pb-4 border-b border-slate-100 shrink-0">
                <div className="flex-1 min-w-0">
                  <h3 className="font-h2 text-xl font-extrabold text-slate-800 truncate">{selectedDetail.jalur}</h3>
                  <p className="font-body-md text-sm text-slate-500 mt-1">{selectedDetail.startPointName} → {selectedDetail.endPointName}</p>
                </div>
                <button onClick={() => setSelectedDetail(null)} className="w-10 h-10 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors shrink-0 ml-3">
                  <span className="material-symbols-outlined text-slate-600">close</span>
                </button>
              </div>

              {/* Map */}
              {trackPath.length >= 2 ? (
                <div className="w-full border-b border-slate-100 shrink-0" style={{ height: 280 }}>
                  <DynamicMap
                    lat={mapCenter.lat}
                    lng={mapCenter.lng}
                    zoom={14}
                    trackPath={trackPath}
                    routeStart={{ lat: selectedDetail.startPointLat, lng: selectedDetail.startPointLong, name: selectedDetail.startPointName }}
                    routeEnd={{ lat: selectedDetail.endPointLat, lng: selectedDetail.endPointLong, name: selectedDetail.endPointName }}
                  />
                </div>
              ) : (
                <div className="w-full h-48 bg-slate-50 flex flex-col items-center justify-center border-b border-slate-100 shrink-0">
                  <span className="material-symbols-outlined text-[40px] text-slate-300 mb-2">map</span>
                  <p className="text-sm text-slate-400">Data rute belum tersedia</p>
                </div>
              )}

              {/* Stats */}
              <div className="p-6 pt-5 flex flex-col gap-4 overflow-y-auto">
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-slate-50 rounded-2xl p-3.5 text-center border border-slate-100">
                    <span className="material-symbols-outlined text-primary text-[20px] mb-1.5 block">straighten</span>
                    <p className="font-data-heavy text-lg text-slate-800 leading-none mb-1">{trackPath.length >= 2 ? totalKm : haversineKm(selectedDetail.startPointLat, selectedDetail.startPointLong, selectedDetail.endPointLat, selectedDetail.endPointLong).toFixed(1)}</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">KM</p>
                  </div>
                  <div className="bg-slate-50 rounded-2xl p-3.5 text-center border border-slate-100">
                    <span className="material-symbols-outlined text-primary text-[20px] mb-1.5 block">schedule</span>
                    <p className="font-data-heavy text-lg text-slate-800 leading-none mb-1">{formatDuration(trk?.durasi ?? null)}</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Durasi</p>
                  </div>
                  <div className="bg-slate-50 rounded-2xl p-3.5 text-center border border-slate-100">
                    <span className="material-symbols-outlined text-primary text-[20px] mb-1.5 block">flag</span>
                    <p className="font-data-heavy text-lg text-slate-800 leading-none mb-1">{trk?.laporan?.length ?? 0}</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Laporan</p>
                  </div>
                </div>

                {/* Time details */}
                <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-green-500 text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>play_circle</span>
                      <span className="text-sm font-bold text-slate-700">Mulai</span>
                    </div>
                    <span className="text-sm font-semibold text-slate-600">{formatTime(trk?.startTime ?? null)}</span>
                  </div>
                  <div className="w-full h-px bg-slate-200 my-3" />
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-red-500 text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>stop_circle</span>
                      <span className="text-sm font-bold text-slate-700">Selesai</span>
                    </div>
                    <span className="text-sm font-semibold text-slate-600">{formatTime(trk?.endTime ?? null)}</span>
                  </div>
                </div>

                {/* Date & ID */}
                <div className="flex items-center justify-between px-1">
                  <p className="font-label-sm text-slate-400">
                    {new Date(selectedDetail.tanggal).toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                  </p>
                  <p className="font-label-sm text-slate-400">
                    #PPJ-{String(selectedDetail.id).padStart(6, '0')}
                  </p>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Loading Detail Overlay */}
      {loadingDetail && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-2xl px-8 py-6 shadow-2xl flex items-center gap-4">
            <span className="material-symbols-outlined text-primary text-[32px] animate-spin">refresh</span>
            <span className="font-body-md text-slate-700 font-semibold">Memuat detail...</span>
          </div>
        </div>
      )}
    </div>
  );
}