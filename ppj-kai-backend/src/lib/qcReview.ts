import { haversineMeters } from '../../../shared/geo';

// Angka awal untuk tanda "perlu dicek" QC; sesuaikan setelah ada masukan lapangan dari KAI.
export const QC_THRESHOLDS = {
  WALK_KMH: 4, // kecepatan jalan kaki inspeksi untuk menaksir durasi wajar
  MIN_DURATION_RATIO: 0.5, // di bawah separuh durasi taksiran dianggap terlalu singkat
  MIN_DURATION_MIN: 10, // patroli selesai di bawah 10 menit selalu ditandai
  GPS_GAP_MIN: 5, // sinyal GPS hilang 5 menit atau lebih
  END_RADIUS_M: 500, // sama dengan radius geofence titik akhir
  LAPORAN_OVERDUE_HOURS: 24, // laporan masih "baru" setelah 24 jam
} as const;

export type QcFlag = 'durasi_singkat' | 'kecepatan_tinggi' | 'gps_hilang' | 'jauh_dari_akhir' | 'berhenti_awal' | 'dihentikan_paksa';

export interface ReviewInput {
  start: { lat: number; lng: number };
  end: { lat: number; lng: number };
  durasiSec: number | null;
  stopLat: number | null;
  stopLng: number | null;
  earlyStopReason: string | null;
  forcedStopAt: Date | null;
  speedEventCount: number;
  longestGapSec: number;
}

/** Taksiran durasi wajar dari jarak garis lurus titik awal ke akhir; jalur rel lebih panjang, jadi taksiran ini longgar. */
export function expectedDurationSec(start: ReviewInput['start'], end: ReviewInput['end']): number {
  return haversineMeters(start.lat, start.lng, end.lat, end.lng) / (QC_THRESHOLDS.WALK_KMH / 3.6);
}

/** Tanda untuk satu sesi patroli yang sudah selesai. */
export function reviewFlags(t: ReviewInput): QcFlag[] {
  const flags: QcFlag[] = [];
  if (t.durasiSec !== null) {
    const minSec = Math.max(QC_THRESHOLDS.MIN_DURATION_MIN * 60, expectedDurationSec(t.start, t.end) * QC_THRESHOLDS.MIN_DURATION_RATIO);
    if (t.durasiSec < minSec) flags.push('durasi_singkat');
  }
  if (t.speedEventCount > 0) flags.push('kecepatan_tinggi');
  if (t.longestGapSec >= QC_THRESHOLDS.GPS_GAP_MIN * 60) flags.push('gps_hilang');
  if (t.earlyStopReason) flags.push('berhenti_awal');
  else if (t.stopLat !== null && t.stopLng !== null
    && haversineMeters(t.stopLat, t.stopLng, t.end.lat, t.end.lng) > QC_THRESHOLDS.END_RADIUS_M) flags.push('jauh_dari_akhir');
  if (t.forcedStopAt) flags.push('dihentikan_paksa');
  return flags;
}
