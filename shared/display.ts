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
