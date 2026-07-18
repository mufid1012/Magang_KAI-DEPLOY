type Station = { name: string };

function normalizeUnicode(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '');
}

/** NIPP tetap mempertahankan tanda baca, tetapi mengabaikan kapital dan semua spasi. */
export function normalizeNipp(value: string): string {
  return normalizeUnicode(value).replace(/\s+/g, '').toUpperCase();
}

/**
 * Nama stasiun mengabaikan kapital, spasi, tanda baca, dan prefiks "Sta/Stasiun".
 * Contoh: " STA.  Solo Balapan " dan "solo-balapan" menjadi "solobalapan".
 */
export function normalizeStationName(value: string): string {
  return normalizeUnicode(value)
    .toLowerCase()
    .trim()
    .replace(/^(?:stasiun|sta)\b[\s.:-]*/u, '')
    .replace(/[^a-z0-9]/g, '');
}

export function levenshteinDistance(left: string, right: string): number {
  if (left === right) return 0;
  if (!left.length) return right.length;
  if (!right.length) return left.length;

  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let i = 1; i <= left.length; i++) {
    const current = [i];
    for (let j = 1; j <= right.length; j++) {
      current[j] = Math.min(
        current[j - 1]! + 1,
        previous[j]! + 1,
        previous[j - 1]! + (left[i - 1] === right[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }

  return previous[right.length]!;
}

export type StationMatch<T extends Station> = {
  station: T;
  distance: number;
};

/**
 * Mengembalikan satu kandidat stasiun yang paling dekat. Kandidat dengan skor seri
 * ditolak agar typo tidak menyebabkan penugasan ke stasiun yang ambigu.
 */
export function findStationMatch<T extends Station>(input: string, stations: readonly T[]): StationMatch<T> | null {
  const normalizedInput = normalizeStationName(input);
  if (!normalizedInput) return null;

  const ranked = stations
    .map(station => ({
      station,
      distance: levenshteinDistance(normalizedInput, normalizeStationName(station.name)),
    }))
    .sort((a, b) => a.distance - b.distance);

  const best = ranked[0];
  if (!best) return null;

  // Maksimal dua edit untuk nama panjang, satu edit untuk nama pendek.
  const maxDistance = Math.min(2, Math.max(1, Math.floor(normalizedInput.length * 0.2)));
  if (best.distance > maxDistance) return null;
  if (ranked[1]?.distance === best.distance) return null;

  return best;
}
