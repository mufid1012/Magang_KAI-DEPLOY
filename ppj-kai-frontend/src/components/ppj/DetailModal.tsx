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
  id: number;
  startTime: string | null;
  endTime: string | null;
  startLat: number | null;
  startLong: number | null;
  endLat: number | null;
  endLong: number | null;
  durasi: number | null;
  status: string;
  laporan: Laporan[];
}

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
  tracking: Tracking[];
}

interface DetailModalProps {
  tugas: Tugas;
  onClose: () => void;
}

const jenisTemuanLabel: Record<string, string> = {
  berat: 'Baut Lepas',
  emergency: 'Rel Retak',
  sedang: 'Penghalang',
  ringan: 'Lainnya',
};

const jenisTemuanColor: Record<string, string> = {
  berat: 'bg-error-container text-error',
  emergency: 'bg-error-container text-error',
  sedang: 'bg-primary-container text-primary',
  ringan: 'bg-surface-container-high text-on-surface-variant',
};

function formatTime(dateStr: string | null) {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

function formatDuration(detik: number | null) {
  if (!detik) return '-';
  const h = Math.floor(detik / 3600);
  const m = Math.floor((detik % 3600) / 60);
  if (h > 0) return `${h}j ${m}m`;
  if (m > 0) return `${m} menit`;
  return `${detik} detik`;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function DetailModal({ tugas, onClose }: DetailModalProps) {
  const latestTracking = tugas.tracking?.[0] ?? null;
  const laporanList = latestTracking?.laporan ?? [];
  const routeKm = haversineKm(
    tugas.startPointLat, tugas.startPointLong,
    tugas.endPointLat, tugas.endPointLong
  ).toFixed(1);

  return (
    <div className="fixed inset-0 z-[9999] bg-on-surface/60 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4">
      <div className="bg-surface w-full max-w-lg rounded-t-xl md:rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-primary px-md py-sm flex items-center justify-between shrink-0">
          <h3 className="font-h3 text-h3 text-on-primary flex items-center gap-sm">
            <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>description</span>
            Detail Inspeksi
          </h3>
          <button onClick={onClose} className="text-on-primary/80 hover:text-on-primary">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-md flex flex-col gap-md">
          {/* Task Info */}
          <div className="flex flex-col items-center text-center">
            <div className="w-16 h-16 bg-primary-container rounded-full flex items-center justify-center mb-sm shadow-lg shadow-primary-container/20">
              <span className="material-symbols-outlined text-primary text-[36px]" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
            </div>
            <h2 className="font-h2 text-h2 text-primary">{tugas.jalur}</h2>
            <p className="font-body-md text-on-surface-variant mt-xs">{tugas.startPointName} → {tugas.endPointName}</p>
            <p className="font-label-sm text-label-sm text-on-surface-variant mt-1">
              {new Date(tugas.tanggal).toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-3 gap-sm">
            <div className="bg-surface-container-lowest border border-outline-variant p-sm rounded-xl shadow-sm text-center">
              <p className="font-label-sm text-[10px] text-on-surface-variant uppercase mb-1">Durasi</p>
              <p className="font-data-heavy text-data-heavy text-primary">{formatDuration(latestTracking?.durasi ?? null)}</p>
            </div>
            <div className="bg-surface-container-lowest border border-outline-variant p-sm rounded-xl shadow-sm text-center">
              <p className="font-label-sm text-[10px] text-on-surface-variant uppercase mb-1">Jarak</p>
              <p className="font-data-heavy text-data-heavy text-on-surface">{routeKm} km</p>
            </div>
            <div className="bg-surface-container-lowest border border-outline-variant p-sm rounded-xl shadow-sm text-center">
              <p className="font-label-sm text-[10px] text-on-surface-variant uppercase mb-1">Kendala</p>
              <p className="font-data-heavy text-data-heavy text-on-surface">{laporanList.length}</p>
            </div>
          </div>

          {/* Time Info */}
          {latestTracking && (
            <div className="bg-surface-container-lowest border border-outline-variant p-md rounded-xl shadow-sm">
              <p className="font-label-sm text-on-surface-variant uppercase mb-sm flex items-center gap-xs">
                <span className="material-symbols-outlined text-[16px]">schedule</span> Waktu
              </p>
              <div className="flex justify-between font-body-md text-on-surface">
                <span>Mulai: {formatTime(latestTracking.startTime)}</span>
                <span>Selesai: {formatTime(latestTracking.endTime)}</span>
              </div>
            </div>
          )}

          {/* Laporan Kendala */}
          {laporanList.length > 0 ? (
            <section>
              <h3 className="font-h3 text-h3 text-on-surface mb-sm flex items-center gap-sm">
                <span className="material-symbols-outlined text-error" style={{ fontVariationSettings: "'FILL' 1" }}>warning</span>
                Laporan Kendala ({laporanList.length})
              </h3>
              <div className="flex flex-col gap-sm">
                {laporanList.map((lap, idx) => (
                  <div key={lap.id} className="bg-surface-container-lowest border border-outline-variant rounded-xl overflow-hidden shadow-sm">
                    {lap.foto && (
                      <div className="w-full aspect-video relative">
                        <img src={lap.foto} alt={`Foto kendala ${idx + 1}`} className="w-full h-full object-cover" />
                      </div>
                    )}
                    <div className="p-sm flex flex-col gap-xs">
                      <div className="flex items-center justify-between">
                        <span className={`px-sm py-xs rounded-full font-label-sm text-[11px] uppercase font-semibold ${jenisTemuanColor[lap.jenisTemuan] ?? 'bg-surface-container text-on-surface-variant'}`}>
                          {jenisTemuanLabel[lap.jenisTemuan] ?? lap.jenisTemuan}
                        </span>
                        <span className="font-label-sm text-label-sm text-on-surface-variant">
                          {new Date(lap.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB
                        </span>
                      </div>
                      {lap.deskripsi && (
                        <p className="font-body-md text-on-surface">{lap.deskripsi}</p>
                      )}
                      <div className="flex items-center gap-xs text-on-surface-variant font-label-sm text-label-sm">
                        <span className="material-symbols-outlined text-[14px]">location_on</span>
                        <span>{lap.latitude.toFixed(5)}, {lap.longitude.toFixed(5)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : (
            <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-lg flex flex-col items-center text-center gap-sm">
              <span className="material-symbols-outlined text-primary text-[40px]" style={{ fontVariationSettings: "'FILL' 1" }}>verified</span>
              <p className="font-body-lg text-on-surface font-semibold">Tidak Ada Kendala</p>
              <p className="font-body-md text-on-surface-variant">Inspeksi berlangsung tanpa laporan darurat.</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-md bg-surface-container-lowest border-t border-surface-variant shrink-0">
          <button onClick={onClose} className="w-full py-3 rounded-xl bg-primary text-on-primary font-label-sm flex items-center justify-center gap-sm shadow-sm">
            <span className="material-symbols-outlined">close</span>
            Tutup
          </button>
          <p className="text-center font-label-sm text-on-surface-variant mt-sm">ID Tugas: #PPJ-{String(tugas.id).padStart(6, '0')}</p>
        </div>
      </div>
    </div>
  );
}
