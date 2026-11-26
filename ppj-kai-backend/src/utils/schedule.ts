const HOUR_MS = 60 * 60 * 1000;

/** Prisma DATE uses UTC date parts; assignment hours are always WIB. */
export function scheduledStart(date: Date | string, time: string | null | undefined): Date | null {
  if (!time || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;
  const day = new Date(date);
  if (!Number.isFinite(day.getTime())) return null;
  const [hours = 0, minutes = 0] = time.split(':').map(Number);
  return new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hours - 7, minutes));
}

/**
 * When a PPJ may start: 1 hour either side of jam mulai. Legacy tasks without a time
 * are limited to their own WIB day. Null = stored time is malformed.
 */
export function startWindow(date: Date | string, time: string | null | undefined): { opensAt: Date; closesAt: Date } | null {
  if (!time) {
    const opensAt = scheduledStart(date, '00:00');
    return opensAt && { opensAt, closesAt: new Date(opensAt.getTime() + 24 * HOUR_MS) };
  }
  const start = scheduledStart(date, time);
  return start && { opensAt: new Date(start.getTime() - HOUR_MS), closesAt: new Date(start.getTime() + HOUR_MS) };
}
