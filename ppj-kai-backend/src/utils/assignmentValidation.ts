import { parseImportTime } from './importMatching';
import { startWindow } from './schedule';

/** Schedule rules shared by manual and Excel assignments. Null means the schedule is fine. */
export function scheduleProblem(date: Date, jamMulai: string | null, jamSelesai: string | null, now = new Date()): string | null {
  if (!jamMulai) return 'Jam mulai wajib diisi';
  // shortcut: an end time at/before the start is rejected, so night shifts past midnight are not supported yet.
  if (jamSelesai && jamSelesai <= jamMulai) return 'Jam selesai harus setelah jam mulai';
  const window = startWindow(date, jamMulai);
  // A task whose start window already closed would turn "Tidak Selesai" within minutes.
  if (window && window.closesAt.getTime() < now.getTime()) return 'Jadwal sudah lewat. Pilih tanggal atau jam mulai yang belum lewat';
  return null;
}
/**
 * Text dates must be YYYY-MM-DD. Other text is rejected because `new Date('10/07/2026')` reads
 * month first (7 October, not 10 July) and shifts a day on a server running in WIB.
 * Excel serial numbers and Date cells are calendar days already.
 */
export function parseAssignmentDate(value: unknown): Date | null {
  let date: Date;
  if (typeof value === 'number') date = new Date(Math.round((value - 25569) * 86400000));
  else if (value instanceof Date) date = new Date(value);
  else if (typeof value === 'string') {
    const text = value.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
    date = new Date(`${text}T00:00:00Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== text) return null;
  } else return null;
  if (!Number.isFinite(date.getTime())) return null;
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}
export function assignmentTimes(start: unknown, end: unknown) {
  const jamMulai = parseImportTime(start), jamSelesai = parseImportTime(end);
  return jamMulai.valid && jamSelesai.valid ? { jamMulai: jamMulai.value, jamSelesai: jamSelesai.value } : null;
}
