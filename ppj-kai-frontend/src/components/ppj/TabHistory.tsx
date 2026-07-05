'use client';

import React, { useState } from 'react';
import DetailModal from './DetailModal';

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

interface TabHistoryProps {
  tasks: Tugas[];
  loading: boolean;
}

const statusLabel: Record<string, string> = {
  pending: 'Menunggu',
  in_progress: 'Sedang Berlangsung',
  completed: 'Selesai',
  cancelled: 'Dibatalkan',
};

const statusStyle: Record<string, string> = {
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

function formatDuration(detik: number | null) {
  if (!detik) return '-';
  const h = Math.floor(detik / 3600);
  const m = Math.floor((detik % 3600) / 60);
  if (h > 0) return `${h}j ${m}m`;
  if (m > 0) return `${m} menit`;
  return `${detik} detik`;
}

const jenisTemuanLabel: Record<string, string> = {
  berat: 'Baut Lepas',
  emergency: 'Rel Retak',
  sedang: 'Penghalang',
  ringan: 'Lainnya',
};

function handleDownloadPDF(tugas: Tugas) {
  const latestTracking = tugas.tracking?.[0] ?? null;
  const laporanList = latestTracking?.laporan ?? [];
  const routeKm = haversineKm(
    tugas.startPointLat, tugas.startPointLong,
    tugas.endPointLat, tugas.endPointLong
  ).toFixed(1);

  const formatTime = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  };

  const laporanRows = laporanList.map((lap, idx) => `
    <tr>
      <td style="padding:8px;border:1px solid #ddd;text-align:center;">${idx + 1}</td>
      <td style="padding:8px;border:1px solid #ddd;">${jenisTemuanLabel[lap.jenisTemuan] ?? lap.jenisTemuan}</td>
      <td style="padding:8px;border:1px solid #ddd;">${lap.deskripsi || '-'}</td>
      <td style="padding:8px;border:1px solid #ddd;text-align:center;">${lap.latitude.toFixed(5)}, ${lap.longitude.toFixed(5)}</td>
      <td style="padding:8px;border:1px solid #ddd;text-align:center;">${new Date(lap.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</td>
    </tr>
  `).join('');

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Laporan Inspeksi PPJ - ${tugas.jalur}</title>
      <style>
        @media print {
          body { margin: 0; }
          .no-print { display: none; }
        }
        body { font-family: 'Segoe UI', Arial, sans-serif; color: #1a1a2e; padding: 40px; line-height: 1.6; }
        .header { text-align: center; border-bottom: 3px solid #004482; padding-bottom: 20px; margin-bottom: 30px; }
        .header h1 { color: #004482; font-size: 24px; margin: 0 0 4px 0; }
        .header p { color: #666; font-size: 13px; margin: 0; }
        .logo-text { font-size: 14px; color: #004482; font-weight: 700; letter-spacing: 2px; margin-bottom: 8px; }
        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; }
        .info-card { background: #f8f9fa; border: 1px solid #e9ecef; border-radius: 8px; padding: 16px; }
        .info-label { font-size: 11px; color: #666; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px; }
        .info-value { font-size: 16px; font-weight: 600; color: #1a1a2e; }
        .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 24px; }
        .stat { background: #004482; color: white; border-radius: 8px; padding: 16px; text-align: center; }
        .stat-value { font-size: 22px; font-weight: 700; }
        .stat-label { font-size: 11px; opacity: 0.8; text-transform: uppercase; }
        table { width: 100%; border-collapse: collapse; margin-top: 12px; }
        th { background: #004482; color: white; padding: 10px 8px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
        td { font-size: 13px; }
        tr:nth-child(even) { background: #f8f9fa; }
        .section-title { font-size: 16px; font-weight: 600; color: #004482; margin-top: 28px; margin-bottom: 12px; display: flex; align-items: center; gap: 8px; }
        .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; text-align: center; color: #999; font-size: 11px; }
        .badge { display: inline-block; padding: 3px 10px; border-radius: 12px; font-size: 11px; font-weight: 600; }
        .badge-completed { background: #d4edda; color: #155724; }
        .badge-cancelled { background: #f8d7da; color: #721c24; }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="logo-text">PT KERETA API INDONESIA</div>
        <h1>Laporan Inspeksi PPJ</h1>
        <p>ID: #PPJ-${String(tugas.id).padStart(6, '0')} · Dicetak: ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
      </div>

      <div class="info-grid">
        <div class="info-card">
          <div class="info-label">Jalur Inspeksi</div>
          <div class="info-value">${tugas.jalur}</div>
        </div>
        <div class="info-card">
          <div class="info-label">Tanggal</div>
          <div class="info-value">${new Date(tugas.tanggal).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div>
        </div>
        <div class="info-card">
          <div class="info-label">Rute</div>
          <div class="info-value">${tugas.startPointName || 'Titik Awal'} → ${tugas.endPointName || 'Titik Akhir'}</div>
        </div>
        <div class="info-card">
          <div class="info-label">Status</div>
          <div class="info-value"><span class="badge ${tugas.status === 'completed' ? 'badge-completed' : 'badge-cancelled'}">${statusLabel[tugas.status] ?? tugas.status}</span></div>
        </div>
      </div>

      <div class="stats">
        <div class="stat">
          <div class="stat-value">${formatDuration(latestTracking?.durasi ?? null)}</div>
          <div class="stat-label">Durasi</div>
        </div>
        <div class="stat">
          <div class="stat-value">${routeKm} km</div>
          <div class="stat-label">Total Jarak</div>
        </div>
        <div class="stat">
          <div class="stat-value">${laporanList.length}</div>
          <div class="stat-label">Kendala Ditemukan</div>
        </div>
      </div>

      ${latestTracking ? `
        <div class="info-grid">
          <div class="info-card">
            <div class="info-label">Waktu Mulai</div>
            <div class="info-value">${formatTime(latestTracking.startTime)}</div>
          </div>
          <div class="info-card">
            <div class="info-label">Waktu Selesai</div>
            <div class="info-value">${formatTime(latestTracking.endTime)}</div>
          </div>
        </div>
      ` : ''}

      ${laporanList.length > 0 ? `
        <div class="section-title">⚠️ Laporan Kendala (${laporanList.length})</div>
        <table>
          <thead>
            <tr>
              <th style="width:40px;">No</th>
              <th>Kategori</th>
              <th>Deskripsi</th>
              <th>Koordinat</th>
              <th>Waktu</th>
            </tr>
          </thead>
          <tbody>
            ${laporanRows}
          </tbody>
        </table>
      ` : `
        <div class="section-title">✅ Tidak Ada Kendala</div>
        <p style="color:#666;font-size:14px;">Inspeksi berlangsung tanpa laporan darurat.</p>
      `}

      <div class="footer">
        <p>Dokumen ini digenerate secara otomatis oleh sistem KAI RailTrack PPJ</p>
        <p>PT Kereta Api Indonesia (Persero) · ${new Date().getFullYear()}</p>
      </div>
    </body>
    </html>
  `;

  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
    setTimeout(() => { printWindow.print(); }, 500);
  }
}

export default function TabHistory({ tasks, loading }: TabHistoryProps) {
  const [selectedTugas, setSelectedTugas] = useState<Tugas | null>(null);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center py-20">
        <div className="flex flex-col items-center gap-md text-on-surface-variant">
          <span className="material-symbols-outlined text-primary text-[48px] animate-spin">refresh</span>
          <p className="font-body-md">Memuat riwayat inspeksi...</p>
        </div>
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-container-padding py-20">
        <div className="flex flex-col items-center text-center max-w-sm">
          <div className="w-28 h-28 rounded-full bg-surface-container flex items-center justify-center mb-lg">
            <span className="material-symbols-outlined text-[56px] text-outline">history</span>
          </div>
          <h2 className="font-h2 text-h2 font-bold text-on-surface mb-sm">Belum Ada Riwayat</h2>
          <p className="font-body-md text-on-surface-variant mb-xl leading-relaxed">
            Setelah menyelesaikan tugas inspeksi, riwayatnya akan muncul di sini.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="max-w-xl mx-auto px-container-padding pt-md pb-32">
        <p className="font-body-md text-on-surface-variant mb-lg">
          Riwayat {tasks.length} tugas inspeksi yang telah selesai:
        </p>

        <div className="flex flex-col gap-md">
          {tasks.map(tugas => {
            const latestTracking = tugas.tracking?.[0] ?? null;
            const routeKm = haversineKm(
              tugas.startPointLat, tugas.startPointLong,
              tugas.endPointLat, tugas.endPointLong
            ).toFixed(1);
            const laporanCount = latestTracking?.laporan?.length ?? 0;

            return (
              <div
                key={tugas.id}
                className="bg-surface-container-lowest rounded-2xl border border-outline-variant shadow-sm overflow-hidden"
              >
                {/* Accent bar */}
                <div className={`h-1 ${tugas.status === 'completed' ? 'bg-green-500' : 'bg-error'}`} />

                <div className="p-md flex flex-col gap-sm">
                  {/* Title + Status */}
                  <div className="flex justify-between items-start gap-sm">
                    <h2 className="font-data-heavy text-data-heavy text-on-surface flex-1 leading-snug">{tugas.jalur}</h2>
                    <span className={`flex items-center gap-1 px-sm py-xs rounded-full font-label-sm text-[10px] uppercase border whitespace-nowrap shrink-0 ${statusStyle[tugas.status] ?? 'bg-surface-container text-on-surface-variant'}`}>
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

                  {/* Stats row */}
                  <div className="flex items-center flex-wrap gap-x-lg gap-y-xs mt-xs pt-sm border-t border-outline-variant/50">
                    <span className="flex items-center gap-1 font-label-sm text-label-sm text-on-surface-variant">
                      <span className="material-symbols-outlined text-[14px]">calendar_today</span>
                      {new Date(tugas.tanggal).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' })}
                    </span>
                    <span className="flex items-center gap-1 font-label-sm text-label-sm text-on-surface-variant">
                      <span className="material-symbols-outlined text-[14px]">timer</span>
                      {formatDuration(latestTracking?.durasi ?? null)}
                    </span>
                    <span className="flex items-center gap-1 font-label-sm text-label-sm text-on-surface-variant">
                      <span className="material-symbols-outlined text-[14px]">straighten</span>
                      {routeKm} km
                    </span>
                    {laporanCount > 0 && (
                      <span className="flex items-center gap-1 font-label-sm text-label-sm text-error">
                        <span className="material-symbols-outlined text-[14px]">warning</span>
                        {laporanCount} kendala
                      </span>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-sm mt-xs">
                    <button
                      onClick={() => setSelectedTugas(tugas)}
                      className="flex-1 h-[40px] rounded-xl border-2 border-primary text-primary font-label-sm flex items-center justify-center gap-xs hover:bg-primary/5 active:scale-[0.97] transition-all"
                    >
                      <span className="material-symbols-outlined text-[18px]">visibility</span>
                      Detail
                    </button>
                    <button
                      onClick={() => handleDownloadPDF(tugas)}
                      className="flex-1 h-[40px] rounded-xl bg-primary text-on-primary font-label-sm flex items-center justify-center gap-xs shadow-sm hover:bg-surface-tint active:scale-[0.97] transition-all"
                    >
                      <span className="material-symbols-outlined text-[18px]">picture_as_pdf</span>
                      Download PDF
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Detail Modal */}
      {selectedTugas && (
        <DetailModal tugas={selectedTugas} onClose={() => setSelectedTugas(null)} />
      )}
    </>
  );
}
