'use client';

import React, { useEffect, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import axios from 'axios';

const AdminMap = dynamic(() => import('../../components/map/AdminMap'), { ssr: false });

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001/api';

interface GuestTask {
  id: number;
  jalur: string;
  startPointLat: number;
  startPointLong: number;
  endPointLat: number;
  endPointLong: number;
  startPointName: string;
  endPointName: string;
  status: string;
}

interface GuestEmergency {
  id: number;
  jenisTemuan: string;
  deskripsi: string;
  latitude: number;
  longitude: number;
  createdAt: string;
}

export default function GuestPage() {
  const [tasks, setTasks] = useState<GuestTask[]>([]);
  const [emergencies, setEmergencies] = useState<GuestEmergency[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const res = await axios.get(`${API_URL}/guest/map-data`);
      const data = res.data.data;

      setTasks(data.tugas || []);
      setEmergencies(data.emergencies || []);
      setError('');
    } catch (e) {
      console.error('Guest fetch error:', e);
      setError('Gagal memuat data peta.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000); // refresh every 30s
    return () => clearInterval(interval);
  }, [fetchData]);

  // Map data format (no sensitive info — no petugasNama/petugasNipp)
  const mapTasks = tasks.map(t => ({
    id: t.id,
    jalur: t.jalur,
    startPointLat: t.startPointLat,
    startPointLong: t.startPointLong,
    endPointLat: t.endPointLat,
    endPointLong: t.endPointLong,
    startPointName: t.startPointName,
    endPointName: t.endPointName,
    status: t.status,
  }));

  const mapEmergencies = emergencies.map(e => ({
    id: e.id,
    latitude: e.latitude,
    longitude: e.longitude,
    jenisTemuan: e.jenisTemuan,
    deskripsi: e.deskripsi,
    foto: null,
    createdAt: e.createdAt,
  }));

  return (
    <div className="h-screen flex flex-col bg-[#F8FAFC] font-sans overflow-hidden">
      {/* Header */}
      <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0 z-50 shadow-sm">
        <div className="flex items-center gap-4">
          <img src="/logo-kai.png" alt="KAI Logo" className="h-8 w-auto object-contain" />
          <div className="h-6 w-px bg-slate-200 hidden sm:block"></div>
          <h1 className="font-h3 text-lg font-extrabold text-slate-800 tracking-tight hidden sm:block">
            Monitoring PPJ <span className="text-primary">DAOP 6</span>
          </h1>
          <span className="ml-2 px-2 py-0.5 bg-slate-500 text-white font-label-sm text-[10px] rounded uppercase font-bold tracking-widest shadow-sm">
            Guest View
          </span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-slate-500 text-sm font-medium">
            <span className="material-symbols-outlined text-[18px]">visibility</span>
            <span className="hidden sm:inline">Mode Publik — Data Terbatas</span>
          </div>
          <Link
            href="/login"
            className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-primary/90 shadow-sm transition-all active:scale-[0.98]"
          >
            <span className="material-symbols-outlined text-[18px]">login</span>
            Masuk
          </Link>
        </div>
      </header>

      {/* Map Area */}
      <main className="flex-1 overflow-hidden flex flex-col relative isolate m-4 bg-white rounded-xl border border-slate-200 shadow-sm">
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="flex flex-col items-center gap-3 text-slate-500">
              <span className="material-symbols-outlined text-primary text-[40px] animate-spin">refresh</span>
              <p className="text-sm font-medium">Memuat peta...</p>
            </div>
          </div>
        ) : error ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="flex flex-col items-center gap-3 text-slate-500">
              <span className="material-symbols-outlined text-error text-[40px]">error</span>
              <p className="text-sm font-medium">{error}</p>
              <button onClick={fetchData} className="mt-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-bold hover:bg-primary/90 transition-all">
                Coba Lagi
              </button>
            </div>
          </div>
        ) : (
          <AdminMap
            emergencies={mapEmergencies}
            tasks={mapTasks}
          />
        )}

        {/* Legend */}
        <div className="absolute bottom-6 left-6 bg-white/95 backdrop-blur-md rounded-xl p-3 shadow-md border border-slate-200 z-[1000]">
          <p className="text-slate-500 uppercase font-bold text-[9px] tracking-widest mb-2">Legenda Visual</p>
          <div className="flex flex-col gap-2">
            {[['#94a3b8', 'Tugas Pending'], ['#005bac', 'Tugas Aktif'], ['#22c55e', 'Selesai']].map(([c, l]) => (
              <div key={l} className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-sm shadow-sm" style={{ background: c }} />
                <span className="text-slate-700 text-[11px] font-semibold">{l}</span>
              </div>
            ))}
            <div className="flex items-center gap-2 mt-1 pt-2 border-t border-slate-100">
              <span className="text-rose-500 font-bold text-[14px] leading-none w-3 text-center">⚠</span>
              <span className="text-slate-700 text-[11px] font-semibold">Laporan Darurat</span>
            </div>
          </div>
        </div>

        {/* Info Badge */}
        <div className="absolute top-6 right-6 bg-white/95 backdrop-blur-md rounded-full px-3 py-1.5 shadow-sm border border-slate-200 flex items-center gap-2 z-[1000]">
          <span className="material-symbols-outlined text-slate-500 text-[16px]">public</span>
          <span className="text-slate-600 text-[10px] font-bold tracking-widest uppercase">Public Map</span>
        </div>

        {/* Stats Overlay */}
        <div className="absolute top-6 left-6 bg-white/95 backdrop-blur-md rounded-xl px-4 py-3 shadow-sm border border-slate-200 z-[1000]">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-[18px]">route</span>
              <div>
                <p className="text-lg font-extrabold text-slate-800 leading-none">{tasks.length}</p>
                <p className="text-[9px] text-slate-500 uppercase font-semibold tracking-widest">Rute Aktif</p>
              </div>
            </div>
            <div className="w-px h-8 bg-slate-200"></div>
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-rose-500 text-[18px]">warning</span>
              <div>
                <p className="text-lg font-extrabold text-slate-800 leading-none">{emergencies.length}</p>
                <p className="text-[9px] text-slate-500 uppercase font-semibold tracking-widest">Insiden</p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
