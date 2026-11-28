export function formatDuration(detik: number | null) {
  if (!detik) return '-';
  const h = Math.floor(detik / 3600);
  const m = Math.floor((detik % 3600) / 60);
  if (h > 0) return `${h}j ${m}m`;
  if (m > 0) return `${m} menit`;
  return `${detik} detik`;
}

export function petugasColor(nipp: string): string {
  let hash = 0;
  for (let i = 0; i < nipp.length; i++) {
    hash = nipp.charCodeAt(i) + ((hash << 5) - hash);
    hash = hash & hash;
  }
  return `hsl(${(Math.abs(hash) * 137) % 360}, 65%, 42%)`;
}

/** Fixed report type for "Kendala PPJ" (the PPJ cannot continue normally). Not an editable finding category. */
export const KENDALA_PPJ_KEY = 'kendala_ppj';
export const KENDALA_PPJ_LABEL = 'Kendala PPJ';
export const KENDALA_REASONS = ['Sakit / kondisi fisik', 'HP / baterai bermasalah', 'Cuaca / kondisi jalur', 'Lainnya'] as const;
