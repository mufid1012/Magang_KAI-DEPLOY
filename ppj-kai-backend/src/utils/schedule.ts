/** Prisma DATE uses UTC date parts; assignment hours are always WIB. */
export function scheduledStart(date: Date | string, time: string | null | undefined): Date | null {
  if (!time || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;
  const day = new Date(date);
  if (!Number.isFinite(day.getTime())) return null;
  const [hours = 0, minutes = 0] = time.split(':').map(Number);
  return new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hours - 7, minutes));
}
