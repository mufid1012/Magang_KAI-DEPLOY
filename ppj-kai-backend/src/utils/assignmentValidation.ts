import { parseImportTime } from './importMatching';
export function parseAssignmentDate(value: unknown): Date | null {
  let date: Date;
  if (typeof value === 'number') date = new Date(Math.round((value - 25569) * 86400000));
  else if (value instanceof Date) date = new Date(value);
  else if (typeof value === 'string') date = new Date(value.trim());
  else return null;
  if (!Number.isFinite(date.getTime())) return null;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim()) && date.toISOString().slice(0,10) !== value.trim()) return null;
  return new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate()));
}
export function assignmentTimes(start: unknown, end: unknown) {
  const jamMulai = parseImportTime(start), jamSelesai = parseImportTime(end);
  return jamMulai.valid && jamSelesai.valid ? { jamMulai: jamMulai.value, jamSelesai: jamSelesai.value } : null;
}
