import { haversineMeters } from '../../../shared/geo';
export { haversineMeters } from '../../../shared/geo';
import { normalizeStationName } from './importMatching';

type WarningRoute = { startPointName: string | null; endPointName: string | null };

export function hasWarningRoute(route: WarningRoute): boolean {
  return Boolean(normalizeStationName(route.startPointName || '') && normalizeStationName(route.endPointName || ''));
}

/** Jalur terkait jika berbagi minimal satu stasiun, terlepas dari arah inspeksi. */
export function hasOverlappingWarningRoute(left: WarningRoute, right: WarningRoute): boolean {
  if (!hasWarningRoute(left) || !hasWarningRoute(right)) return false;
  const start = normalizeStationName(left.startPointName!);
  const end = normalizeStationName(left.endPointName!);
  const otherStart = normalizeStationName(right.startPointName!);
  const otherEnd = normalizeStationName(right.endPointName!);
  return start === otherStart || start === otherEnd || end === otherStart || end === otherEnd;
}

type Position = { latitude: number; longitude: number };

/** Umur maksimum bukti posisi yang masih boleh dipakai untuk memilih penerima warning. */
export const WARNING_POSITION_TTL_MS = 120_000;
/** Akurasi sampel terakhir yang masih masuk akal untuk penempatan (bukan untuk validasi kecepatan). */
export const WARNING_SAMPLE_ACCURACY_M = 500;

export type WarningPositionRow = {
  endLat: number | null;
  endLong: number | null;
  positionCapturedAt: Date | null;
  startLat: number | null;
  startLong: number | null;
  startTime: Date | null;
  latestSample?: { latitude: number; longitude: number; capturedAt: Date; accuracy: number } | null;
};

const isFiniteCoordinate = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/**
 * Tentukan posisi penerima warning dari bukti terbaik yang benar-benar baru.
 *
 * `positionCapturedAt` hanya terisi kalau ada sampel yang lolos filter akurasi
 * (<= 20 m). Di lapangan HP sering melapor akurasi 20-50 m, sehingga sesi tetap
 * aktif dan sampel terus masuk tetapi `positionCapturedAt` selamanya null.
 * Karena itu sampel terakhir dipakai sebagai cadangan, lalu titik awal sesi
 * kalau sesinya baru dimulai. Tanpa bukti baru, PPJ tidak boleh dianggap ada.
 */
export function resolveWarningPosition(row: WarningPositionRow, now: Date): (Position & { updatedAt: Date }) | null {
  const fresh = (at: Date | null | undefined): at is Date =>
    !!at && now.getTime() - at.getTime() <= WARNING_POSITION_TTL_MS;
  // GPS perangkat bisa sedikit mendahului jam server; jangan sampai itu membuat
  // selectWarningRecipients membuang kandidat karena updatedAt "di masa depan".
  const stamp = (at: Date) => (at.getTime() > now.getTime() ? new Date(now.getTime()) : at);

  if (fresh(row.positionCapturedAt) && isFiniteCoordinate(row.endLat) && isFiniteCoordinate(row.endLong)) {
    return { latitude: row.endLat, longitude: row.endLong, updatedAt: stamp(row.positionCapturedAt) };
  }

  const sample = row.latestSample;
  if (sample && fresh(sample.capturedAt) && isFiniteCoordinate(sample.latitude) && isFiniteCoordinate(sample.longitude)
    && !(sample.accuracy > WARNING_SAMPLE_ACCURACY_M)) {
    return { latitude: sample.latitude, longitude: sample.longitude, updatedAt: stamp(sample.capturedAt) };
  }

  if (fresh(row.startTime) && isFiniteCoordinate(row.startLat) && isFiniteCoordinate(row.startLong)) {
    return { latitude: row.startLat, longitude: row.startLong, updatedAt: stamp(row.startTime) };
  }

  return null;
}
type TaskRoute = WarningRoute & { startPointLat: number; startPointLong: number; endPointLat: number; endPointLong: number };
type Candidate = Position & { id: number; userId: number; updatedAt: Date; tugas: WarningRoute };



/**
 * Pilih PPJ terdekat pada tiap sisi untuk setiap pasangan jalur yang terkait.
 * Sisi tetap diproyeksikan pada sumbu stasiun pengirim, bukan arah jalan petugas.
 * Pasangan jalur berbeda mendapat slot sendiri agar jalur sambungan ikut menerima.
 */
export function selectWarningRecipients(sender: Position & { userId: number }, route: TaskRoute, candidates: Candidate[], now: Date) {
  const scale = Math.cos(sender.latitude * Math.PI / 180);
  const dx = (route.endPointLong - route.startPointLong) * scale;
  const dy = route.endPointLat - route.startPointLat;
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || (dx === 0 && dy === 0)) return [];
  const eligible = candidates.filter(candidate => candidate.userId !== sender.userId
    && hasOverlappingWarningRoute(route, candidate.tugas)
    && now.getTime() - candidate.updatedAt.getTime() <= 120_000
    && now.getTime() >= candidate.updatedAt.getTime()
    && Number.isFinite(candidate.latitude) && Math.abs(candidate.latitude) <= 90
    && Number.isFinite(candidate.longitude) && Math.abs(candidate.longitude) <= 180)
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime() || a.id - b.id);
  const users = new Set<number>();
  const latest = eligible.filter(candidate => {
    if (users.has(candidate.userId)) return false;
    users.add(candidate.userId);
    return true;
  }).sort((a, b) => haversineMeters(sender.latitude, sender.longitude, a.latitude, a.longitude)
    - haversineMeters(sender.latitude, sender.longitude, b.latitude, b.longitude) || a.id - b.id);
  const sides = new Map<string, Set<boolean>>();
  return latest.filter(candidate => {
    const routeKey = JSON.stringify([
      normalizeStationName(candidate.tugas.startPointName!),
      normalizeStationName(candidate.tugas.endPointName!),
    ].sort());
    const routeSides = sides.get(routeKey) ?? new Set<boolean>();
    const towardEnd = (candidate.longitude - sender.longitude) * scale * dx + (candidate.latitude - sender.latitude) * dy >= 0;
    if (routeSides.has(towardEnd)) return false;
    routeSides.add(towardEnd);
    sides.set(routeKey, routeSides);
    return true;
  }).map(candidate => candidate.id);
}
