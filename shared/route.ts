export type RoutePoint = [number, number];
export const MAX_STORED_ROUTE_POINTS = 20_000;
/** Keep endpoints, including when reading an older long session. */
export function compactRoute(points: RoutePoint[], limit = MAX_STORED_ROUTE_POINTS): RoutePoint[] {
  if (points.length <= limit) return points;
  if (limit < 2) throw new Error('A route needs at least two endpoints');
  return Array.from({ length: limit }, (_, i) => points[Math.round(i * (points.length - 1) / (limit - 1))]!);
}
export function parseRoute(value: unknown): RoutePoint[] | null {
  let input = value;
  if (typeof input === 'string') { try { input = JSON.parse(input); } catch { return null; } }
  if (!Array.isArray(input) || input.length > 200_000) return null;
  const points: RoutePoint[] = [];
  for (const point of input) {
    if (!Array.isArray(point) || point.length !== 2 || point.some(n => typeof n !== 'number' && typeof n !== 'string') || point.some(n => n === '')) return null;
    const lat = Number(point[0]), lng = Number(point[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat)>90 || Math.abs(lng)>180) return null;
    points.push([lat,lng]);
  }
  return compactRoute(points);
}
