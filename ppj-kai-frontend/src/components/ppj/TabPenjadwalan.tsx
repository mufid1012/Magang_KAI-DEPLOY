'use client';

import React from 'react';

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
}

interface TabPenjadwalanProps {
  tasks: Tugas[];
  loading: boolean;
  onStartTracking: (tugasId: number) => void;
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

export default function TabPenjadwalan({ tasks, loading, onStartTracking }: TabPenjadwalanProps) {
  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center py-20">
        <div className="flex flex-col items-center gap-md text-on-surface-variant">
          <span className="material-symbols-outlined text-primary text-[48px] animate-spin">refresh</span>
          <p className="font-body-md">Memuat tugas inspeksi...</p>
        </div>
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-container-padding py-20">
        <div className="flex flex-col items-center text-center max-w-sm">
          <div className="w-28 h-28 rounded-full bg-surface-container flex items-center justify-center mb-lg">
            <span className="material-symbols-outlined text-[56px] text-outline">railway_alert</span>
          </div>
          <h2 className="font-h2 text-h2 font-bold text-on-surface mb-sm">Tugas Belum Tersedia</h2>
          <p className="font-body-md text-on-surface-variant mb-xl leading-relaxed">
            Saat ini Anda belum memiliki tugas inspeksi yang ditugaskan. Hubungi admin atau tunggu penugasan baru.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto px-container-padding pt-md pb-32">
      <p className="font-body-md text-on-surface-variant mb-lg">
        Daftar tugas inspeksi yang tersedia untuk Anda:
      </p>

      <div className="flex flex-col gap-md">
        {tasks.map(tugas => {
          const distance = haversineKm(
            tugas.startPointLat, tugas.startPointLong,
            tugas.endPointLat, tugas.endPointLong
          );

          return (
            <div
              key={tugas.id}
              className="bg-surface-container-lowest rounded-2xl border border-outline-variant shadow-sm overflow-hidden group"
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
                <div className="flex items-center flex-wrap gap-x-lg gap-y-xs mt-xs pt-sm border-t border-outline-variant/50">
                  <span className="flex items-center gap-1 font-label-sm text-label-sm text-on-surface-variant">
                    <span className="material-symbols-outlined text-[14px]">straighten</span>
                    {distance.toFixed(1)} km
                  </span>
                  <span className="flex items-center gap-1 font-label-sm text-label-sm text-on-surface-variant">
                    <span className="material-symbols-outlined text-[14px]">calendar_today</span>
                    {new Date(tugas.tanggal).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' })}
                  </span>
                  {(tugas.jamMulai || tugas.jamSelesai) && (
                    <span className="flex items-center gap-1 font-label-sm text-label-sm text-on-surface-variant">
                      <span className="material-symbols-outlined text-[14px]">schedule</span>
                      {tugas.jamMulai ?? '--:--'} — {tugas.jamSelesai ?? '--:--'}
                    </span>
                  )}
                </div>

                {/* Start Tracking Button */}
                <button
                  onClick={() => onStartTracking(tugas.id)}
                  className={`w-full mt-sm font-body-md font-semibold h-[44px] rounded-xl flex items-center justify-center gap-sm shadow-sm active:scale-[0.97] transition-all ${
                    tugas.status === 'in_progress'
                      ? 'bg-primary text-on-primary hover:bg-surface-tint'
                      : 'bg-primary text-on-primary hover:bg-surface-tint'
                  }`}
                >
                  <span className="material-symbols-outlined text-[20px]">
                    {tugas.status === 'in_progress' ? 'play_circle' : 'play_arrow'}
                  </span>
                  {tugas.status === 'in_progress' ? 'Lanjutkan Tracking' : 'Mulai Tracking'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
