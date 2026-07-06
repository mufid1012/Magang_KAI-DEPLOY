'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import api from '../../../../lib/api';
import { showToast } from '../../../../lib/toast';

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
  status: string;
  tracking: Tracking[];
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

export default function InspeksiSelesaiPage({ params }: { params: { id: string } }) {
  const [tugas, setTugas] = useState<Tugas | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    const fetchDetail = async () => {
      try {
        const res = await api.get(`/tugas/${params.id}`);
        setTugas(res.data.data);
      } catch (err) {
        console.error('Error fetching detail:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchDetail();
  }, [params.id]);

  const handleDownloadPdf = async () => {
    try {
      setIsDownloading(true);
      const res = await api.get(`/tugas/${params.id}/report`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Laporan_Inspeksi_PPJ_${params.id}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error('Download PDF error:', err);
      showToast(err.response?.data?.message || 'Gagal mengunduh laporan PDF.', 'error');
    } finally {
      setIsDownloading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-md text-on-surface-variant">
          <span className="material-symbols-outlined text-primary text-[48px] animate-spin">refresh</span>
          <p className="font-body-md">Memuat data inspeksi...</p>
        </div>
      </div>
    );
  }

  if (!tugas) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-lg text-center px-container-padding">
          <span className="material-symbols-outlined text-[56px] text-outline">search_off</span>
          <div>
            <p className="font-h3 text-h3 text-on-surface mb-xs">Data tidak ditemukan</p>
            <p className="font-body-md text-on-surface-variant">Tugas ID #{params.id} tidak tersedia untuk akun Anda.</p>
          </div>
          <div className="flex gap-md">
            <a href="/inspeksi" className="px-md py-sm bg-primary text-on-primary rounded-xl font-label-sm flex items-center gap-xs">
              <span className="material-symbols-outlined text-[16px]">map</span> Kembali ke Tugas
            </a>
          </div>
        </div>
      </div>
    );
  }

  const latestTracking = tugas.tracking[0] ?? null;
  const laporanList = latestTracking?.laporan ?? [];

  return (
    <div className="bg-background text-on-surface min-h-screen pb-32 font-body-md antialiased">
      {/* Header */}
      <header className="bg-surface/80 backdrop-blur-md shadow-sm top-0 z-50 sticky flex justify-between items-center w-full px-container-padding h-16">
        <div className="flex items-center gap-md">
          <Link href="/inspeksi" className="material-symbols-outlined text-primary hover:text-primary-container transition-colors">
            arrow_back
          </Link>
          <h1 className="font-h2 text-h2 font-bold text-primary">Detail Inspeksi</h1>
        </div>
      </header>

      <main className="max-w-xl mx-auto px-container-padding pt-lg">
        {/* Status badge */}
        <div className="flex flex-col items-center justify-center text-center mb-xl">
          <div className="w-20 h-20 bg-primary-container rounded-full flex items-center justify-center mb-md shadow-lg shadow-primary-container/20">
            <span className="material-symbols-outlined text-primary text-[48px]" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
          </div>
          <h2 className="font-h1 text-h1 text-primary">{tugas.jalur}</h2>
          <p className="font-body-lg text-on-surface-variant mt-xs">{tugas.startPointName} → {tugas.endPointName}</p>
          <p className="font-label-sm text-label-sm text-on-surface-variant mt-1">
            {new Date(tugas.tanggal).toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-md mb-lg">
          <div className="col-span-2 bg-surface-container-lowest border border-outline-variant p-md rounded-xl shadow-sm">
            <p className="font-label-sm text-on-surface-variant flex items-center gap-xs mb-xs uppercase">
              <span className="material-symbols-outlined text-[16px]">schedule</span> Durasi
            </p>
            <p className="font-h1 text-h1 text-primary">{formatDuration(latestTracking?.durasi ?? null)}</p>
            <p className="font-body-md text-on-surface-variant">
              Mulai: {formatTime(latestTracking?.startTime ?? null)} · Selesai: {formatTime(latestTracking?.endTime ?? null)}
            </p>
          </div>
          <div className="bg-surface-container-lowest border border-outline-variant p-md rounded-xl shadow-sm">
            <p className="font-label-sm text-on-surface-variant flex items-center gap-xs mb-xs uppercase">
              <span className="material-symbols-outlined text-[16px]">flag</span> Laporan
            </p>
            <p className="font-data-heavy text-data-heavy text-on-surface">
              {laporanList.length} <span className="text-body-md font-normal">kendala</span>
            </p>
          </div>
          <div className="bg-surface-container-lowest border border-outline-variant p-md rounded-xl shadow-sm">
            <p className="font-label-sm text-on-surface-variant flex items-center gap-xs mb-xs uppercase">
              <span className="material-symbols-outlined text-[16px]">location_on</span> Status
            </p>
            <p className="font-data-heavy text-data-heavy text-on-surface capitalize">{tugas.status}</p>
          </div>
        </div>

        {/* Laporan Kendala Section */}
        {laporanList.length > 0 && (
          <section className="mb-lg">
            <h3 className="font-h3 text-h3 text-on-surface mb-md flex items-center gap-sm">
              <span className="material-symbols-outlined text-error" style={{ fontVariationSettings: "'FILL' 1" }}>warning</span>
              Laporan Kendala ({laporanList.length})
            </h3>
            <div className="flex flex-col gap-md">
              {laporanList.map((lap, idx) => (
                <div key={lap.id} className="bg-surface-container-lowest border border-outline-variant rounded-xl overflow-hidden shadow-sm">
                  {/* Photo if exists */}
                  {lap.foto && (
                    <div className="w-full aspect-video relative">
                      <img
                        src={lap.foto}
                        alt={`Foto kendala ${idx + 1}`}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}
                  <div className="p-md flex flex-col gap-sm">
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
        )}

        {laporanList.length === 0 && (
          <section className="mb-lg">
            <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-lg flex flex-col items-center text-center gap-sm">
              <span className="material-symbols-outlined text-primary text-[40px]" style={{ fontVariationSettings: "'FILL' 1" }}>verified</span>
              <p className="font-body-lg text-on-surface font-semibold">Tidak Ada Kendala</p>
              <p className="font-body-md text-on-surface-variant">Inspeksi berlangsung tanpa laporan darurat.</p>
            </div>
          </section>
        )}
      </main>

      {/* Bottom Action */}
      <div className="fixed bottom-0 left-0 right-0 bg-surface/90 backdrop-blur-xl px-container-padding py-md shadow-[0px_-8px_24px_rgba(0,0,0,0.05)] z-40 border-t border-outline-variant/10">
        <div className="max-w-xl mx-auto flex flex-col gap-sm">
          <button
            onClick={handleDownloadPdf}
            disabled={isDownloading}
            className="w-full bg-surface-container-high text-on-surface border border-outline-variant font-h3 text-h3 py-md rounded-xl shadow-sm active:scale-[0.98] transition-all flex items-center justify-center gap-md disabled:opacity-50"
          >
            {isDownloading ? 'Mengunduh Laporan...' : 'Download Laporan PDF'}
            <span className="material-symbols-outlined">{isDownloading ? 'hourglass_empty' : 'picture_as_pdf'}</span>
          </button>
          
          <Link href="/inspeksi" className="w-full bg-primary text-on-primary font-h3 text-h3 py-md rounded-xl shadow-lg active:scale-[0.98] transition-all flex items-center justify-center gap-md">
            Kembali ke Daftar Tugas
            <span className="material-symbols-outlined">map</span>
          </Link>
          <p className="text-center font-label-sm text-on-surface-variant mt-sm">ID Tugas: #PPJ-{String(tugas.id).padStart(6, '0')}</p>
        </div>
      </div>
    </div>
  );
}
