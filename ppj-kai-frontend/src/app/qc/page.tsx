'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import api from '../../lib/api';
import { STATIONS } from '../../lib/stations';
import { useRouter } from 'next/navigation';

const AdminMap = dynamic(() => import('../../components/map/AdminMap'), { ssr: false });

// ─── Types ──────────────────────────────────────────────────────────────────

interface Tugas {
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
  user: { nama: string; nipp: string };
  tracking?: {
    startTime: string;
    endTime: string;
    durasi: number;
    status: string;
    laporan: Emergency[];
  }[];
}

interface Emergency {
  id: number;
  latitude: number;
  longitude: number;
  jenisTemuan: string;
  deskripsi: string;
  foto: string | null;
  createdAt: string;
  tracking?: {
    tugas: {
      jalur: string;
      user: { nama: string; nipp: string };
    };
  };
}

interface LivePosition {
  petugasNama: string;
  petugasNipp: string;
  tugasId: number;
  jalur: string;
  latitude: number;
  longitude: number;
  updatedAt: string;
}

interface Stats {
  totalPetugas: number;
  tugasAktif: number;
  tugasSelesai: number;
  laporanDarurat: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function petugasColor(nipp: string): string {
  let hash = 0;
  for (let i = 0; i < nipp.length; i++) {
    hash = nipp.charCodeAt(i) + ((hash << 5) - hash);
    hash = hash & hash;
  }
  return `hsl(${(Math.abs(hash) * 137) % 360}, 65%, 42%)`;
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  in_progress: 'Berlangsung',
  completed: 'Selesai',
};
const STATUS_COLOR: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  in_progress: 'bg-blue-50 text-blue-700 border-blue-200',
  completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

const DEFAULT_JENIS_LABEL: Record<string, string> = {
  kerusakan_rel: 'Kerusakan Rel',
  gangguan_struktur: 'Gangguan Struktur Jalur',
  anjlokan_kecelakaan: 'Anjlokan atau Kecelakaan',
  lainnya: 'Lainnya',
};

// ─── Component ──────────────────────────────────────────────────────────────

export default function QCPage() {
  const router = useRouter();
  const [user, setUser] = useState<{ 
    nama: string; 
    role: string;
    wilayahAssignments?: { wilayah: { kode: string; nama: string; stations: string } }[];
  } | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [tugas, setTugas] = useState<Tugas[]>([]);
  const [emergencies, setEmergencies] = useState<Emergency[]>([]);
  const [livePositions, setLivePositions] = useState<LivePosition[]>([]);
  const [selectedJalur, setSelectedJalur] = useState<string>('__all__');
  const [selectedEmergency, setSelectedEmergency] = useState<Emergency | null>(null);
  const [loading, setLoading] = useState(true);
  const [jenisLabel, setJenisLabel] = useState<Record<string, string>>(DEFAULT_JENIS_LABEL);

  // ─── Data Fetching ──────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    try {
      const [statsRes, tugasRes, emRes, meRes, liveRes, katRes] = await Promise.all([
        api.get('/admin/stats'),
        api.get('/admin/tugas'),
        api.get('/admin/emergency'),
        api.get('/auth/me'),
        api.get('/admin/live-positions'),
        api.get('/kategori-temuan'),
      ]);
      setStats(statsRes.data.data);
      setTugas(tugasRes.data.data);
      setEmergencies(emRes.data.data);
      setUser(meRes.data.user);
      setLivePositions(liveRes.data.data);
      // Build dynamic jenis label map
      if (katRes.data.data && katRes.data.data.length > 0) {
        const labels: Record<string, string> = {};
        katRes.data.data.forEach((k: { key: string; label: string }) => { labels[k.key] = k.label; });
        setJenisLabel(labels);
      }
    } catch (e) {
      console.error('QC fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 15000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    router.replace('/login');
  };

  // ─── Derived Data ─────────────────────────────────────────────────────────

  // Build unique jalur list from user's wilayahAssignments
  const wilayahList = useMemo(() => {
    if (!user?.wilayahAssignments) return [];
    return user.wilayahAssignments.map(a => ({
      kode: a.wilayah.kode,
      nama: a.wilayah.nama,
      stations: JSON.parse(a.wilayah.stations || '[]') as string[],
      label: `${a.wilayah.kode} ${a.wilayah.nama}`,
    })).sort((a, b) => a.kode.localeCompare(b.kode));
  }, [user]);

  // Filter tugas by selected wilayah
  const filteredTugas = useMemo(() => {
    if (selectedJalur === '__all__') return tugas;
    const selectedWilayah = wilayahList.find(w => w.kode === selectedJalur);
    if (!selectedWilayah) return tugas;
    return tugas.filter(t => selectedWilayah.stations.some(s => t.jalur.includes(s)));
  }, [tugas, selectedJalur, wilayahList]);

  // Filter emergencies by selected wilayah
  const filteredEmergencies = useMemo(() => {
    if (selectedJalur === '__all__') return emergencies;
    const selectedWilayah = wilayahList.find(w => w.kode === selectedJalur);
    if (!selectedWilayah) return emergencies;
    return emergencies.filter(e => {
      const jalur = e.tracking?.tugas?.jalur;
      if (!jalur) return false;
      return selectedWilayah.stations.some(s => jalur.includes(s));
    });
  }, [emergencies, selectedJalur, wilayahList]);

  // Map data props
  const mapEmergencies = filteredEmergencies.map(e => ({
    id: e.id,
    latitude: e.latitude,
    longitude: e.longitude,
    jenisTemuan: e.jenisTemuan,
    deskripsi: e.deskripsi,
    foto: e.foto,
    createdAt: e.createdAt,
    petugasNama: e.tracking?.tugas?.user?.nama,
    jalur: e.tracking?.tugas?.jalur,
  }));

  const mapTasks = filteredTugas.map(t => ({
    id: t.id,
    jalur: t.jalur,
    startPointLat: t.startPointLat,
    startPointLong: t.startPointLong,
    endPointLat: t.endPointLat,
    endPointLong: t.endPointLong,
    startPointName: t.startPointName,
    endPointName: t.endPointName,
    status: t.status,
    petugasNama: t.user?.nama,
    petugasNipp: t.user?.nipp,
  }));

  // Filter live positions by selected wilayah
  const filteredLivePositions = useMemo(() => {
    if (selectedJalur === '__all__') return livePositions;
    const selectedWilayah = wilayahList.find(w => w.kode === selectedJalur);
    if (!selectedWilayah) return livePositions;
    return livePositions.filter(p =>
      selectedWilayah.stations.some(s => p.jalur.includes(s))
    );
  }, [livePositions, selectedJalur, wilayahList]);

  // Compute maxBounds from QC's wilayah stations
  const maxBounds = useMemo<[[number, number], [number, number]] | undefined>(() => {
    if (!user?.wilayahAssignments || user.wilayahAssignments.length === 0) return undefined;
    
    let targetStations: string[] = [];
    if (selectedJalur === '__all__') {
      // Collect all station names from all wilayah assignments
      for (const a of user.wilayahAssignments) {
        try {
          const parsed = JSON.parse(a.wilayah.stations || '[]') as string[];
          targetStations.push(...parsed);
        } catch { /* skip */ }
      }
    } else {
      const selectedWilayah = wilayahList.find(w => w.kode === selectedJalur);
      if (selectedWilayah) {
        targetStations = selectedWilayah.stations;
      }
    }

    if (targetStations.length === 0) return undefined;
    // Match station names to coordinates
    const matchedStations = STATIONS.filter(s => targetStations.includes(s.name));
    if (matchedStations.length === 0) return undefined;
    // Compute bounding box with padding
    const PAD = 0.04; // ~4.4 km padding
    const lats = matchedStations.map(s => s.lat);
    const lngs = matchedStations.map(s => s.lng);
    return [
      [Math.min(...lats) - PAD, Math.min(...lngs) - PAD],
      [Math.max(...lats) + PAD, Math.max(...lngs) + PAD],
    ];
  }, [user, selectedJalur, wilayahList]);

  // Stats summary for active filtered view
  const filteredStats = useMemo(() => {
    const aktif = filteredTugas.filter(t => t.status === 'in_progress').length;
    const pending = filteredTugas.filter(t => t.status === 'pending').length;
    const selesai = filteredTugas.filter(t => t.status === 'completed').length;
    const darurat = filteredEmergencies.length;
    return { aktif, pending, selesai, darurat };
  }, [filteredTugas, filteredEmergencies]);

  // ─── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-[#F8FAFC]">
        <div className="flex flex-col items-center gap-4">
          <span className="material-symbols-outlined text-primary text-[48px] animate-spin">refresh</span>
          <p className="text-slate-500 font-medium text-sm">Memuat data Quality Control...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-[#F8FAFC] font-sans overflow-hidden">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="h-14 bg-white/95 backdrop-blur-md border-b border-slate-200 flex items-center justify-between px-5 shrink-0 z-50 shadow-sm">
        <div className="flex items-center gap-3">
          <img src="/logo-kai.png" alt="KAI Logo" className="h-7 w-auto object-contain" />
          <div className="h-5 w-px bg-slate-200 hidden sm:block"></div>
          <h1 className="font-extrabold text-slate-800 tracking-tight text-sm hidden sm:block">
            Quality Control <span className="text-primary">PPJ</span>
          </h1>
          <span className="ml-1 px-2 py-0.5 text-white font-bold text-[9px] rounded uppercase tracking-widest shadow-sm bg-indigo-600">
            QC
          </span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-indigo-100 text-indigo-700 rounded-full flex items-center justify-center font-bold text-xs border border-indigo-200">
              {user?.nama?.substring(0, 2).toUpperCase() || 'QC'}
            </div>
            <span className="hidden md:block font-bold text-slate-700 text-sm">{user?.nama}</span>
          </div>
          <div className="w-px h-5 bg-slate-200"></div>
          <button onClick={handleLogout} className="flex items-center gap-1.5 text-slate-400 hover:text-rose-600 transition-colors" title="Logout">
            <span className="material-symbols-outlined text-[20px]">logout</span>
          </button>
        </div>
      </header>

      {/* ── Main Map Area ───────────────────────────────────────────────── */}
      <main className="flex-1 overflow-hidden relative isolate">
        {/* Full-screen Map */}
        <AdminMap
          emergencies={mapEmergencies}
          tasks={mapTasks}
          livePositions={filteredLivePositions}
          maxBounds={maxBounds}
          onEmergencyClick={(em) => {
            setSelectedEmergency(emergencies.find(e => e.id === em.id) || null);
          }}
        />

        {/* ── Overlay: Jalur Dropdown + Stats ───────────────────────────── */}
        <div className="absolute top-4 left-4 z-[1000] flex flex-col gap-3 max-w-[340px]">
          {/* Dropdown Jalur */}
          <div className="bg-white/95 backdrop-blur-md rounded-xl shadow-lg border border-slate-200 p-3">
            <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block mb-1.5 flex items-center gap-1">
              <span className="material-symbols-outlined text-indigo-600 text-[14px]">route</span>
              Filter Jalur
            </label>
            <select
              value={selectedJalur}
              onChange={e => setSelectedJalur(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none font-medium shadow-sm cursor-pointer"
            >
              <option value="__all__">Semua Jalur ({tugas.length} tugas)</option>
              {wilayahList.map(w => {
                const count = tugas.filter(t => w.stations.some(s => t.jalur.includes(s))).length;
                return (
                  <option key={w.kode} value={w.kode}>
                    {w.label} ({count} tugas)
                  </option>
                );
              })}
            </select>

            {/* Quick Stats under dropdown */}
            <div className="flex items-center gap-2 mt-2.5 flex-wrap">
              <div className="flex items-center gap-1 bg-blue-50 border border-blue-100 rounded-md px-2 py-1">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></div>
                <span className="text-[10px] font-bold text-blue-700">{filteredStats.aktif} Aktif</span>
              </div>
              <div className="flex items-center gap-1 bg-amber-50 border border-amber-100 rounded-md px-2 py-1">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-500"></div>
                <span className="text-[10px] font-bold text-amber-700">{filteredStats.pending} Pending</span>
              </div>
              <div className="flex items-center gap-1 bg-emerald-50 border border-emerald-100 rounded-md px-2 py-1">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                <span className="text-[10px] font-bold text-emerald-700">{filteredStats.selesai} Selesai</span>
              </div>
              {filteredStats.darurat > 0 && (
                <div className="flex items-center gap-1 bg-rose-50 border border-rose-100 rounded-md px-2 py-1">
                  <span className="text-rose-500 text-[10px]">⚠</span>
                  <span className="text-[10px] font-bold text-rose-700">{filteredStats.darurat} Insiden</span>
                </div>
              )}
            </div>
          </div>

          {/* Task List Panel (collapsible) */}
          {filteredTugas.length > 0 && (
            <div className="bg-white/95 backdrop-blur-md rounded-xl shadow-lg border border-slate-200 overflow-hidden max-h-[calc(100vh-260px)]">
              <div className="px-3 py-2 border-b border-slate-100 bg-slate-50/80">
                <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px] text-slate-400">assignment</span>
                  Daftar Tugas ({filteredTugas.length})
                </p>
              </div>
              <div className="overflow-y-auto max-h-[300px] divide-y divide-slate-100">
                {filteredTugas.map(t => (
                  <div key={t.id} className="px-3 py-2.5 hover:bg-slate-50 transition-colors">
                    <div className="flex justify-between items-start gap-2 mb-1">
                      <p className="font-bold text-slate-800 text-xs leading-snug truncate flex-1">{t.jalur}</p>
                      <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider border shrink-0 ${STATUS_COLOR[t.status]}`}>
                        {STATUS_LABEL[t.status]}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div
                        className="w-4 h-4 rounded-full flex items-center justify-center text-white text-[6px] font-bold shrink-0"
                        style={{ background: petugasColor(t.user?.nipp || '') }}
                      >
                        {t.user?.nama?.substring(0, 2).toUpperCase()}
                      </div>
                      <span className="text-[10px] text-slate-600 font-medium truncate">{t.user?.nama}</span>
                      <span className="text-[10px] text-slate-400 font-medium ml-auto shrink-0">
                        {new Date(t.tanggal).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Overlay: Live Sync Indicator ───────────────────────────────── */}
        <div className="absolute top-4 right-4 bg-white/95 backdrop-blur-md rounded-full px-3 py-1.5 shadow-sm border border-slate-200 flex items-center gap-2 z-[1000]">
          <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
          <span className="text-slate-600 text-[10px] font-bold tracking-widest uppercase">Live Sync</span>
        </div>

        {/* ── Overlay: Map Legend ────────────────────────────────────────── */}
        <div className="absolute bottom-4 left-4 bg-white/95 backdrop-blur-md rounded-xl p-3 shadow-md border border-slate-200 z-[1000]">
          <p className="text-slate-500 uppercase font-bold text-[9px] tracking-widest mb-2">Legenda Visual</p>
          <div className="flex flex-col gap-2">
            {[
              ['#94a3b8', 'Tugas Pending'],
              ['#005bac', 'Tugas Aktif'],
              ['#22c55e', 'Selesai'],
            ].map(([c, l]) => (
              <div key={l} className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-sm shadow-sm" style={{ background: c }} />
                <span className="text-slate-700 text-[11px] font-semibold">{l}</span>
              </div>
            ))}
            <div className="flex items-center gap-2 mt-1 pt-2 border-t border-slate-100">
              <span className="text-rose-500 font-bold text-[14px] leading-none w-3 text-center">⚠</span>
              <span className="text-slate-700 text-[11px] font-semibold">Laporan Darurat</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-indigo-500 shadow-sm relative">
                <div className="absolute inset-0 rounded-full bg-indigo-400 animate-ping opacity-40"></div>
              </div>
              <span className="text-slate-700 text-[11px] font-semibold">Posisi Petugas (Live)</span>
            </div>
          </div>
        </div>

        {/* ── Overlay: Global KPI (bottom-right) ────────────────────────── */}
        <div className="absolute bottom-4 right-4 bg-white/95 backdrop-blur-md rounded-xl shadow-md border border-slate-200 z-[1000]">
          <div className="flex items-center divide-x divide-slate-100">
            {[
              { icon: 'group', value: stats?.totalPetugas ?? '-', label: 'Petugas', color: 'text-blue-600' },
              { icon: 'task_alt', value: stats?.tugasAktif ?? '-', label: 'Aktif', color: 'text-amber-600' },
              { icon: 'check_circle', value: stats?.tugasSelesai ?? '-', label: 'Selesai', color: 'text-emerald-600' },
              { icon: 'emergency', value: stats?.laporanDarurat ?? '-', label: 'Darurat', color: 'text-rose-600' },
            ].map(s => (
              <div key={s.label} className="flex flex-col items-center px-4 py-2.5">
                <span className={`material-symbols-outlined text-[16px] ${s.color} mb-0.5`}>{s.icon}</span>
                <p className="font-extrabold text-slate-800 text-sm leading-none">{s.value}</p>
                <p className="text-[8px] text-slate-500 uppercase tracking-widest font-bold mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* ── Emergency Detail Modal ──────────────────────────────────────── */}
      {selectedEmergency && (
        <div className="fixed inset-0 z-[9999] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-rose-600 px-6 py-4 flex items-center justify-between">
              <h3 className="text-base font-bold text-white flex items-center gap-3 tracking-wide">
                <span className="material-symbols-outlined text-[20px]">warning</span> DETAIL INSIDEN
              </h3>
              <button onClick={() => setSelectedEmergency(null)} className="text-white/70 hover:text-white transition-colors">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            {selectedEmergency.foto && (
              <div className="w-full h-56 bg-slate-100">
                <img src={selectedEmergency.foto} alt="darurat" className="w-full h-full object-cover" />
              </div>
            )}
            <div className="p-6 space-y-5">
              <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                <span className="bg-rose-100 text-rose-700 px-3 py-1 rounded-md text-xs font-extrabold uppercase tracking-widest">
                  {jenisLabel[selectedEmergency.jenisTemuan] ?? selectedEmergency.jenisTemuan}
                </span>
                <span className="text-xs font-semibold text-slate-500">
                  {new Date(selectedEmergency.createdAt).toLocaleString('id-ID')}
                </span>
              </div>
              {selectedEmergency.deskripsi && (
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                  <p className="text-sm text-slate-700 leading-relaxed font-medium">{selectedEmergency.deskripsi}</p>
                </div>
              )}
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 shadow-inner space-y-3">
                <div className="flex justify-between items-center">
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Pelapor</p>
                  <p className="text-sm font-bold text-slate-800">{selectedEmergency.tracking?.tugas?.user?.nama}</p>
                </div>
                <div className="flex justify-between items-center">
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Jalur</p>
                  <p className="text-sm font-bold text-slate-800 text-right">{selectedEmergency.tracking?.tugas?.jalur}</p>
                </div>
                <div className="flex justify-between items-center">
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">GPS</p>
                  <p className="text-xs font-bold text-slate-700 font-mono bg-white border border-slate-200 px-2 py-0.5 rounded shadow-sm">
                    {selectedEmergency.latitude.toFixed(6)}, {selectedEmergency.longitude.toFixed(6)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
