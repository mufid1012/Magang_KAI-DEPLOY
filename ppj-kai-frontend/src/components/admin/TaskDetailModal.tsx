'use client';

import React from 'react';

interface Laporan {
  id: number;
  jenisTemuan: string;
  deskripsi: string;
  foto: string | null;
  latitude: number;
  longitude: number;
  createdAt: string;
}

interface Tracking {
  startTime: string | null;
  endTime: string | null;
  durasi: number | null;
  fotoAwal?: string | null;
  fotoSelesai?: string | null;
  laporan: Laporan[];
}

export interface AdminTaskDetail {
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
  user: { nama: string; nipp: string; jabatan?: string | null; division?: string | null; workArea?: string | null };
  tracking?: Tracking[];
}

interface Props {
  tugas: AdminTaskDetail;
  jenisLabel: Record<string, string>;
  jenisColor: Record<string, string>;
  isDownloading: boolean;
  onDownloadPdf: () => void;
  onClose: () => void;
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  in_progress: 'Berlangsung',
  completed: 'Selesai',
  cancelled: 'Dibatalkan',
  missed: 'Terlewat',
};

function formatTime(value: string | null | undefined) {
  if (!value) return '-';
  return `${new Date(value).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB`;
}

function formatDuration(seconds: number | null | undefined) {
  if (!seconds) return '-';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}j ${minutes}m`;
  if (minutes > 0) return `${minutes} menit`;
  return `${seconds} detik`;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const radius = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const value = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return (radius * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value))).toFixed(1);
}

export default function TaskDetailModal({ tugas, jenisLabel, jenisColor, isDownloading, onDownloadPdf, onClose }: Props) {
  const latestTracking = tugas.tracking?.[0] ?? null;
  const laporan = latestTracking?.laporan ?? [];
  const completed = tugas.status === 'completed';

  return (
    <div className="fixed inset-0 z-[9999] bg-slate-900/60 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white w-full max-w-2xl rounded-t-2xl md:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        <div className="bg-slate-800 px-5 md:px-6 py-4 flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <span className="material-symbols-outlined text-emerald-400">description</span>
              Detail Inspeksi
            </h3>
            <p className="text-[10px] text-slate-400 font-semibold tracking-widest mt-0.5">ID #PPJ-{String(tugas.id).padStart(6, '0')}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors" aria-label="Tutup detail">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-5">
          <div className="text-center">
            <div className={`w-16 h-16 mx-auto rounded-full flex items-center justify-center mb-3 ${completed ? 'bg-emerald-100 text-emerald-600' : tugas.status === 'in_progress' ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-500'}`}>
              <span className="material-symbols-outlined text-[36px]">{completed ? 'check_circle' : tugas.status === 'in_progress' ? 'directions_walk' : 'assignment'}</span>
            </div>
            <h2 className="text-xl font-extrabold text-slate-800">{tugas.jalur}</h2>
            <p className="text-sm text-slate-500 mt-1">{tugas.startPointName || 'Titik Awal'} → {tugas.endPointName || 'Titik Akhir'}</p>
            <div className="flex items-center justify-center gap-2 mt-2">
              <span className="text-xs font-semibold text-slate-500">{new Date(tugas.tanggal).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
              <span className="text-slate-300">•</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${completed ? 'bg-emerald-100 text-emerald-700' : tugas.status === 'in_progress' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>{STATUS_LABEL[tugas.status] ?? tugas.status}</span>
            </div>
          </div>

          <section className="bg-slate-50 border border-slate-200 rounded-xl p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3">Data Petugas</p>
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-primary text-white flex items-center justify-center font-extrabold text-sm shrink-0">
                {tugas.user.nama.substring(0, 2).toUpperCase()}
              </div>
              <div>
                <p className="font-bold text-slate-800">{tugas.user.nama}</p>
                <p className="text-xs font-semibold text-slate-500 mt-0.5">NIPP {tugas.user.nipp}</p>
                <p className="text-xs text-slate-500 mt-1">{tugas.user.jabatan || 'Petugas PPJ'}{(tugas.user.workArea || tugas.user.division) ? ` • ${tugas.user.workArea || tugas.user.division}` : ''}</p>
              </div>
            </div>
          </section>

          <div className="grid grid-cols-3 gap-2 md:gap-3">
            {[
              ['Durasi', formatDuration(latestTracking?.durasi), 'timer'],
              ['Jarak Rute', `${haversineKm(tugas.startPointLat, tugas.startPointLong, tugas.endPointLat, tugas.endPointLong)} km`, 'straighten'],
              ['Laporan', String(laporan.length), 'flag'],
            ].map(([label, value, icon]) => (
              <div key={label} className="bg-white border border-slate-200 rounded-xl p-3 text-center shadow-sm">
                <span className="material-symbols-outlined text-primary text-[19px]">{icon}</span>
                <p className="font-extrabold text-slate-800 text-sm mt-1">{value}</p>
                <p className="text-[9px] uppercase tracking-wider font-bold text-slate-500 mt-0.5">{label}</p>
              </div>
            ))}
          </div>

          {latestTracking ? (
            <section className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3">Waktu Inspeksi</p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-xs text-slate-500">Mulai</p><p className="font-bold text-slate-800 mt-0.5">{formatTime(latestTracking.startTime)}</p></div>
                <div><p className="text-xs text-slate-500">Selesai</p><p className="font-bold text-slate-800 mt-0.5">{formatTime(latestTracking.endTime)}</p></div>
              </div>
            </section>
          ) : (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3 text-amber-800">
              <span className="material-symbols-outlined">schedule</span>
              <p className="text-sm font-semibold">Petugas belum memulai inspeksi untuk tugas ini.</p>
            </div>
          )}

          {latestTracking && (latestTracking.fotoAwal || latestTracking.fotoSelesai) && (
            <section>
              <h4 className="font-bold text-slate-800 text-sm mb-3">Foto Verifikasi Petugas</h4>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Foto Awal', photo: latestTracking.fotoAwal },
                  { label: 'Foto Selesai', photo: latestTracking.fotoSelesai },
                ].map(item => item.photo && (
                  <div key={item.label} className="rounded-xl overflow-hidden border border-slate-200 bg-slate-50">
                    <img src={item.photo} alt={item.label} className="w-full aspect-video object-cover" />
                    <p className="text-xs font-bold text-slate-600 p-2 text-center">{item.label}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {laporan.length > 0 ? (
            <section>
              <h4 className="font-bold text-slate-800 text-sm mb-3 flex items-center gap-2"><span className="material-symbols-outlined text-rose-500 text-[20px]">warning</span>Laporan Kendala ({laporan.length})</h4>
              <div className="space-y-3">
                {laporan.map((item, index) => (
                  <div key={item.id} className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
                    {item.foto && <img src={item.foto} alt={`Foto kendala ${index + 1}`} className="w-full max-h-64 object-cover" />}
                    <div className="p-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className={`px-2 py-1 rounded text-[10px] uppercase font-bold ${jenisColor[item.jenisTemuan] ?? 'bg-slate-100 text-slate-700'}`}>{jenisLabel[item.jenisTemuan] ?? item.jenisTemuan}</span>
                        <span className="text-[10px] font-semibold text-slate-500">{formatTime(item.createdAt)}</span>
                      </div>
                      {item.deskripsi && <p className="text-sm text-slate-700 mt-2">{item.deskripsi}</p>}
                      <p className="text-[10px] text-slate-500 font-medium mt-2 flex items-center gap-1"><span className="material-symbols-outlined text-[14px]">location_on</span>{item.latitude.toFixed(5)}, {item.longitude.toFixed(5)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : latestTracking && completed ? (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 text-center">
              <span className="material-symbols-outlined text-emerald-600 text-[36px]">verified</span>
              <p className="font-bold text-emerald-800 mt-1">Tidak Ada Kendala</p>
              <p className="text-xs text-emerald-700 mt-1">Inspeksi selesai tanpa laporan kendala.</p>
            </div>
          ) : null}
        </div>

        <div className="p-4 border-t border-slate-200 bg-white shrink-0 flex flex-col-reverse sm:flex-row gap-2">
          <button onClick={onClose} className="sm:w-1/3 py-3 rounded-xl border border-slate-300 text-slate-700 font-bold text-sm hover:bg-slate-50">Tutup</button>
          <button onClick={onDownloadPdf} disabled={isDownloading} className="flex-1 py-3 rounded-xl bg-primary text-white font-bold text-sm flex items-center justify-center gap-2 shadow-md shadow-primary/20 hover:bg-primary/90 disabled:opacity-50">
            <span className="material-symbols-outlined text-[19px]">{isDownloading ? 'hourglass_empty' : 'picture_as_pdf'}</span>
            {isDownloading ? 'Mengunduh PDF...' : 'Download Laporan PDF'}
          </button>
        </div>
      </div>
    </div>
  );
}
