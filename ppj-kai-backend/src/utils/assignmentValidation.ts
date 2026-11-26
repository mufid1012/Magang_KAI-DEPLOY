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
// Indonesian month names and common short forms, matched case-insensitively ("Juli", "JUL", "agt").
const MONTHS: Record<string, number> = {
  januari: 1, jan: 1, februari: 2, feb: 2, peb: 2, maret: 3, mar: 3, april: 4, apr: 4, mei: 5,
  juni: 6, jun: 6, juli: 7, jul: 7, agustus: 8, agu: 8, ags: 8, agt: 8, agst: 8,
  september: 9, sep: 9, sept: 9, oktober: 10, okt: 10, november: 11, nov: 11, nop: 11, desember: 12, des: 12,
};

function calendarDay(year: number, month: number, day: number): Date | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  // Rejects days that do not exist, such as 31-04 or 29-02 outside a leap year.
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : null;
}

/**
 * Text dates use the Indonesian order DD-MM-YYYY: separators - / . or a space, one- or two-digit
 * day and month, and month names in any letter case ("10 Juli 2026", "10-JUL-2026").
 * YYYY-MM-DD stays accepted for the manual form and older templates. Month-first text is never
 * guessed: `new Date('10/07/2026')` would read it as 7 October and shift a day in WIB.
 * Excel serial numbers and Date cells are calendar days already.
 */
export function parseAssignmentDate(value: unknown): Date | null {
  if (typeof value === 'number' || value instanceof Date) {
    const date = typeof value === 'number' ? new Date(Math.round((value - 25569) * 86400000)) : new Date(value);
    if (!Number.isFinite(date.getTime())) return null;
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  }
  if (typeof value !== 'string') return null;
  const text = value.trim().toLowerCase().replace(/\s+/g, ' ');
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return calendarDay(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const dmy = text.match(/^(\d{1,2})[-/. ](\d{1,2}|[a-z]+)[-/. ](\d{4})$/);
  if (!dmy) return null;
  const month = /^\d+$/.test(dmy[2]!) ? Number(dmy[2]) : MONTHS[dmy[2]!];
  return month ? calendarDay(Number(dmy[3]), month, Number(dmy[1])) : null;
}
export function assignmentTimes(start: unknown, end: unknown) {
  const jamMulai = parseImportTime(start), jamSelesai = parseImportTime(end);
  return jamMulai.valid && jamSelesai.valid ? { jamMulai: jamMulai.value, jamSelesai: jamSelesai.value } : null;
}
