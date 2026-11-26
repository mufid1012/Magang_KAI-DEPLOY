/**
 * pdfmake document definition for the PPJ inspection report.
 *
 * Design notes (one line each, so the choices stay deliberate):
 * - Colour: KAI app navy #004482 carries structure; the darkened KAI orange marks findings only;
 *   red is reserved for emergency findings and an unsafe verdict.
 * - Type: Helvetica, the PDF built-in face, because the server ships no font files and a
 *   formal inspection document needs nothing more expressive.
 * - Motif: a thin double rule ("rel") under the letterhead and every section heading.
 * - Focal point: the safety verdict box on page one; everything else supports it.
 * - Order follows how a reviewer reads a trip: verdict, plan vs actual, map, findings, telemetry, sign-off.
 */
import { formatDuration } from '../../../shared/display';
import { haversineMeters } from '../../../shared/geo';
import { parseRoute } from '../../../shared/route';
import { TELEMETRY } from '../../../shared/telemetry';
import type { LatLng } from './staticMap';

export const REPORT_COLORS = {
  navy: '#004482',
  ink: '#191c21',
  muted: '#545b69',
  line: '#c2c6d3',
  soft: '#f2f3fb',
  accent: '#b4500c',
  danger: '#ba1a1a',
  dangerSoft: '#fbeceb',
} as const;
const C = REPORT_COLORS;
const PAGE_WIDTH = 515;

export interface ReportFinding {
  no: number;
  label: string;
  emergency: boolean;
  createdAt: Date;
  lat: number;
  lng: number;
  deskripsi: string;
  foto: string | null;
  kmFromStart: number | null;
}

export interface ReportSpeedEvent { startAt: Date; durationMs: number; maxKmh: number; meanKmh: number }

export interface ReportInput {
  id: number;
  jalur: string;
  tanggal: Date;
  jamMulai: string | null;
  jamSelesai: string | null;
  startPoint: { name: string | null; lat: number; lng: number };
  endPoint: { name: string | null; lat: number; lng: number };
  petugas: { nama: string; nipp: string; jabatan: string | null; unit: string | null };
  tracking: null | {
    status: string;
    startTime: Date | null;
    endTime: Date | null;
    durasi: number | null;
    start: { lat: number; lng: number } | null;
    end: { lat: number; lng: number } | null;
    fotoAwal: string | null;
    fotoSelesai: string | null;
    approved: boolean;
    approvedAt: Date | null;
    approver: { nama: string; nipp: string } | null;
    unsafe: boolean;
    testMode: boolean;
    /** Set when the managing admin/KUPT ended the session on the PPJ's behalf. */
    forcedStop?: { at: Date; by: { nama: string; nipp: string } | null; reason: string } | null;
    rejection?: { at: Date; by: { nama: string; nipp: string } | null; reason: string } | null;
    /** Set when the PPJ ended before the end point. */
    earlyStopReason?: string | null;
    reportedLoss: number;
    sampleCount: number;
    averageKmh: number | null;
    /** Periods with no GPS sample received (screen off, app closed, no signal). */
    gpsGaps?: { from: Date; to: Date }[];
  };
  route: LatLng[];
  map: { image: string | null; note: string | null };
  findings: ReportFinding[];
  speedEvents: ReportSpeedEvent[];
  logo: string | null;
  printedAt: Date;
}

// ---------- pure helpers ----------

const TZ = 'Asia/Jakarta';
const num = (value: number, digits = 2) => value.toLocaleString('id-ID', { minimumFractionDigits: digits, maximumFractionDigits: digits });
export const reportNumber = (id: number) => `PPJ-${String(id).padStart(6, '0')}`;
const fmtDate = (d: Date) => d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ });
const fmtShortDate = (d: Date) => d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: TZ });
const fmtClock = (d: Date | null) => (d ? d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: TZ }) : '-');
const fmtPlanClock = (hhmm: string | null) => (hhmm && /^\d{1,2}:\d{2}$/.test(hhmm) ? `${hhmm.padStart(5, '0').replace(':', '.')} WIB` : '-');

function jakartaMinutes(d: Date): number {
  const parts = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: TZ }).formatToParts(d);
  const get = (type: string) => Number(parts.find(p => p.type === type)?.value ?? 0);
  return get('hour') * 60 + get('minute');
}
function planMinutes(hhmm: string | null): number | null {
  const m = hhmm?.match(/^(\d{1,2}):(\d{2})$/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}
function minutesText(total: number): string {
  const abs = Math.abs(total);
  if (abs < 60) return `${abs} menit`;
  return abs % 60 ? `${Math.floor(abs / 60)} jam ${abs % 60} menit` : `${abs / 60} jam`;
}
export function scheduleGap(plan: string | null, actual: Date | null): string {
  const planned = planMinutes(plan);
  if (planned === null || !actual) return '-';
  const diff = jakartaMinutes(actual) - planned;
  if (diff === 0) return 'sesuai jadwal';
  return `${minutesText(diff)} ${diff > 0 ? 'setelah' : 'sebelum'} jadwal`;
}

export function routeLengthKm(route: LatLng[]): number {
  let meters = 0;
  for (let i = 1; i < route.length; i++) meters += haversineMeters(route[i - 1]![0], route[i - 1]![1], route[i]![0], route[i]![1]);
  return meters / 1000;
}

/**
 * GPS trail for the report. The stop request always appends the stop position, so a stored
 * route of one point means no trail was recorded; the map then shows markers only, never a guessed line.
 */
export function reportRoute(tracking: { routePath: string | null; startLat: number | null; startLong: number | null }): LatLng[] {
  const trail = (tracking.routePath ? parseRoute(tracking.routePath) : null) ?? [];
  if (trail.length < 2) return [];
  const route: LatLng[] = [...trail];
  if (tracking.startLat !== null && tracking.startLong !== null
    && haversineMeters(tracking.startLat, tracking.startLong, route[0]![0], route[0]![1]) > 1) {
    route.unshift([tracking.startLat, tracking.startLong]);
  }
  return route;
}

/** Distance along the route (km) to the route point nearest the given position. */
export function distanceAlongRouteKm(route: LatLng[], lat: number, lng: number): number | null {
  if (route.length < 2) return null;
  let cumulative = 0, best = Infinity, bestKm = 0;
  for (let i = 0; i < route.length; i++) {
    if (i > 0) cumulative += haversineMeters(route[i - 1]![0], route[i - 1]![1], route[i]![0], route[i]![1]);
    const d = haversineMeters(route[i]![0], route[i]![1], lat, lng);
    if (d < best) { best = d; bestKm = cumulative / 1000; }
  }
  return bestKm;
}

const printableImage = (src: string | null): src is string => !!src && /^data:image\/(png|jpe?g);base64,/i.test(src);

// ---------- building blocks ----------

const rail = (color: string = C.line, width = PAGE_WIDTH, margin: number[] = [0, 4, 0, 10]) => ({
  canvas: [
    { type: 'line', x1: 0, y1: 0, x2: width, y2: 0, lineWidth: 0.8, lineColor: color },
    { type: 'line', x1: 0, y1: 3, x2: width, y2: 3, lineWidth: 0.8, lineColor: color },
  ],
  margin,
});

/** Heading travels with its first block so a title never sits alone at the bottom of a page. */
const section = (no: number, title: string, blocks: any[]) => {
  const heading = {
    stack: [
      { columns: [
        { text: String(no), width: 16, bold: true, fontSize: 12, color: C.navy },
        { text: title, bold: true, fontSize: 12, color: C.ink },
      ] },
      rail(),
    ],
  };
  const [first, ...rest] = blocks;
  return [{ stack: [heading, ...(first ? [first] : [])], unbreakable: true, margin: [0, 18, 0, 0] }, ...rest];
};

const label = (text: string) => ({ text, fontSize: 8.5, color: C.muted });

const tableLayout = {
  hLineWidth: (i: number, node: any) => (i === 0 || i === node.table.body.length ? 0 : 0.5),
  vLineWidth: () => 0,
  hLineColor: () => C.line,
  paddingLeft: () => 6,
  paddingRight: () => 6,
  paddingTop: () => 4,
  paddingBottom: () => 4,
};
const headerRow = (cells: string[]) => cells.map(text => ({ text, bold: true, fontSize: 8.5, color: C.muted, fillColor: C.soft }));

function numberBadge(no: number, color: string) {
  return {
    table: { widths: [14], body: [[{ text: String(no), bold: true, fontSize: 9, color: '#ffffff', fillColor: color, alignment: 'center' }]] },
    layout: { hLineWidth: () => 0, vLineWidth: () => 0, paddingLeft: () => 1, paddingRight: () => 1, paddingTop: () => 1, paddingBottom: () => 1 },
  };
}

// ---------- sections ----------

function letterhead(input: ReportInput) {
  const approved = !!input.tracking?.approved;
  const badge = approved
    ? { text: 'Disetujui', bold: true, color: '#ffffff', fillColor: C.navy, alignment: 'center', fontSize: 9 }
    : { text: 'Draft, belum disetujui', bold: true, color: C.danger, alignment: 'center', fontSize: 9 };
  return [
    {
      columns: [
        { width: 88, stack: [input.logo ? { image: input.logo, width: 74, margin: [0, 4, 0, 0] } : { text: 'KAI', bold: true, fontSize: 22, color: C.navy }] },
        { stack: [
          { text: 'PT Kereta Api Indonesia (Persero)', fontSize: 9, color: C.muted },
          { text: 'Laporan Inspeksi Jalur', fontSize: 19, bold: true, color: C.navy, margin: [0, 1, 0, 1] },
          { text: input.jalur, fontSize: 11, color: C.ink },
        ], width: '*' },
        { width: 130, stack: [
          { text: `No. ${reportNumber(input.id)}`, fontSize: 9, color: C.muted, alignment: 'right', margin: [0, 2, 0, 4] },
          { table: { widths: ['*'], body: [[badge]] }, layout: {
            hLineWidth: () => (approved ? 0 : 0.8), vLineWidth: () => (approved ? 0 : 0.8),
            hLineColor: () => C.danger, vLineColor: () => C.danger,
            paddingTop: () => 3, paddingBottom: () => 3,
          } },
          { text: fmtShortDate(input.tanggal), fontSize: 9, color: C.muted, alignment: 'right', margin: [0, 4, 0, 0] },
        ] },
      ],
    },
    rail(C.navy, PAGE_WIDTH, [0, 10, 0, 0]),
    ...(input.tracking?.forcedStop ? [{
      text: `Inspeksi dihentikan paksa oleh ${input.tracking.forcedStop.by ? `${input.tracking.forcedStop.by.nama} (NIPP ${input.tracking.forcedStop.by.nipp})` : 'pengelola'} pada ${fmtShortDate(input.tracking.forcedStop.at)}, ${fmtClock(input.tracking.forcedStop.at)} WIB. Alasan: ${input.tracking.forcedStop.reason}. Jejak GPS berasal dari data yang diterima server; foto selesai tidak tersedia.`,
      fontSize: 9, color: C.danger, margin: [0, 6, 0, 0],
    }] : []),
    ...(input.tracking?.earlyStopReason ? [{
      text: `Inspeksi diakhiri petugas sebelum mencapai titik akhir. Alasan: ${input.tracking.earlyStopReason}.`,
      fontSize: 9, color: C.danger, margin: [0, 6, 0, 0],
    }] : []),
    ...(input.tracking?.rejection ? [{
      text: `HASIL DITOLAK oleh ${input.tracking.rejection.by ? `${input.tracking.rejection.by.nama} (NIPP ${input.tracking.rejection.by.nipp})` : 'pengelola'} pada ${fmtShortDate(input.tracking.rejection.at)}, ${fmtClock(input.tracking.rejection.at)} WIB. Alasan: ${input.tracking.rejection.reason}.`,
      bold: true, fontSize: 9, color: C.danger, margin: [0, 6, 0, 0],
    }] : []),
    ...(input.tracking?.testMode ? [{
      text: 'Sesi ini dijalankan dalam mode uji (bypass): syarat foto, radius 500 m, dan jendela waktu tidak divalidasi server.',
      fontSize: 9, color: C.accent, margin: [0, 6, 0, 0],
    }] : []),
  ];
}

export function summarySentence(input: ReportInput): string {
  const t = input.tracking;
  const when = fmtDate(input.tanggal);
  if (!t) return `Inspeksi jalur ${input.jalur} dijadwalkan ${when} dan belum dimulai petugas.`;
  if (t.status === 'started') return `Inspeksi jalur ${input.jalur} pada ${when} masih berjalan, laporan ini bersifat sementara.`;
  const n = input.findings.length;
  const darurat = input.findings.filter(f => f.emergency).length;
  const trip = [
    input.route.length >= 2 ? `menempuh ${num(routeLengthKm(input.route))} km` : '',
    t.durasi ? `dalam ${formatDuration(t.durasi)}` : '',
  ].filter(Boolean).join(' ') || 'menyelesaikan inspeksi';
  const findings = n === 0
    ? 'tidak mencatat temuan'
    : `mencatat ${n} temuan${darurat ? `, ${darurat} di antaranya darurat` : ''}`;
  return `Petugas ${trip} dan ${findings}.`;
}

function verdict(input: ReportInput) {
  const t = input.tracking;
  const unsafe = !!t?.unsafe;
  const status = !t ? 'Belum dimulai' : t.status === 'started' ? 'Berjalan' : unsafe ? 'Tidak aman' : 'Aman';
  const color = unsafe ? C.danger : C.navy;
  return {
    table: {
      widths: [150, '*'],
      body: [[
        { stack: [label('Status keselamatan jalur'), { text: status, fontSize: 20, bold: true, color, margin: [0, 2, 0, 0] }] },
        { text: summarySentence(input), fontSize: 10.5, color: C.ink, margin: [0, 6, 0, 0] },
      ]],
    },
    layout: {
      hLineWidth: () => 0, vLineWidth: () => 0,
      fillColor: () => (unsafe ? C.dangerSoft : C.soft),
      paddingLeft: () => 12, paddingRight: () => 12, paddingTop: () => 10, paddingBottom: () => 10,
    },
    margin: [0, 14, 0, 0],
  };
}

function metrics(input: ReportInput) {
  const t = input.tracking;
  const n = input.findings.length;
  const darurat = input.findings.filter(f => f.emergency).length;
  const hasRoute = input.route.length >= 2;
  const cell = (title: string, value: string, note: string, valueColor: string = C.ink) => ({
    stack: [label(title), { text: value, fontSize: 15, bold: true, color: valueColor, margin: [0, 2, 0, 1] }, { text: note, fontSize: 8.5, color: C.muted }],
  });
  return {
    table: {
      widths: ['*', '*', '*', '*'],
      body: [[
        cell('Temuan', t ? String(n) : '-', !t ? 'belum ada sesi' : n === 0 ? 'tidak ada temuan' : darurat ? `${darurat} darurat` : 'tidak ada yang darurat', darurat ? C.danger : C.ink),
        cell('Jarak tempuh', hasRoute ? `${num(routeLengthKm(input.route))} km` : '-', hasRoute ? `jejak GPS, ${input.route.length} titik` : 'jejak GPS tidak cukup'),
        cell('Durasi', t?.durasi ? formatDuration(t.durasi) : '-', t?.startTime ? `${fmtClock(t.startTime)} - ${fmtClock(t.endTime)} WIB` : 'belum dimulai'),
        cell('Kecepatan rata-rata', t?.averageKmh != null ? `${num(t.averageKmh, 1)} km/jam` : '-', t?.averageKmh != null ? 'segmen GPS valid' : 'data GPS belum cukup'),
      ]],
    },
    layout: {
      hLineWidth: () => 0,
      vLineWidth: (i: number) => (i === 0 || i === 4 ? 0 : 0.5),
      vLineColor: () => C.line,
      paddingLeft: (i: number) => (i === 0 ? 0 : 10), paddingRight: () => 8, paddingTop: () => 2, paddingBottom: () => 2,
    },
    margin: [0, 12, 0, 0],
  };
}

function identity(input: ReportInput) {
  const p = input.petugas;
  const row = (k: string, v: string) => [{ text: k, color: C.muted }, { text: v, color: C.ink }];
  const left = [row('Petugas', p.nama), row('NIPP', p.nipp), ...(p.jabatan ? [row('Jabatan', p.jabatan)] : []), ...(p.unit ? [row('Unit / wilayah', p.unit)] : [])];
  const right = [row('Jalur', input.jalur), row('Tanggal', fmtDate(input.tanggal)), row('Nomor laporan', reportNumber(input.id))];
  const mini = (body: any[]) => ({ table: { widths: [72, '*'], body }, layout: 'noBorders', fontSize: 9.5 });
  return { columns: [mini(left), mini(right)], columnGap: 20 };
}

function planVsActual(input: ReportInput) {
  const t = input.tracking;
  const pointName = (p: { name: string | null; lat: number; lng: number }) => p.name || `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`;
  const offset = (plan: { lat: number; lng: number }, actual: { lat: number; lng: number } | null | undefined) =>
    actual ? `${Math.round(haversineMeters(plan.lat, plan.lng, actual.lat, actual.lng)).toLocaleString('id-ID')} m dari titik rencana` : '-';
  const plannedSpan = (() => {
    const a = planMinutes(input.jamMulai), b = planMinutes(input.jamSelesai);
    return a !== null && b !== null && b > a ? minutesText(b - a) : '-';
  })();
  const body = [
    headerRow(['Butir', 'Rencana', 'Realisasi', 'Keterangan']),
    ['Titik mulai', pointName(input.startPoint), t?.start ? `${t.start.lat.toFixed(5)}, ${t.start.lng.toFixed(5)}` : '-', offset(input.startPoint, t?.start)],
    ['Titik selesai', pointName(input.endPoint), t?.end ? `${t.end.lat.toFixed(5)}, ${t.end.lng.toFixed(5)}` : '-', offset(input.endPoint, t?.end)],
    ['Jam mulai', fmtPlanClock(input.jamMulai), t?.startTime ? `${fmtClock(t.startTime)} WIB` : '-', scheduleGap(input.jamMulai, t?.startTime ?? null)],
    ['Jam selesai', fmtPlanClock(input.jamSelesai), t?.endTime ? `${fmtClock(t.endTime)} WIB` : '-', scheduleGap(input.jamSelesai, t?.endTime ?? null)],
    ['Durasi', plannedSpan, t?.durasi ? formatDuration(t.durasi) : '-', ''],
  ];
  return { table: { headerRows: 1, widths: [62, '*', 110, 130], body }, layout: tableLayout, fontSize: 9 };
}

function mapSection(input: ReportInput) {
  const blocks: any[] = [];
  if (input.map.image) {
    blocks.push({ image: input.map.image, width: PAGE_WIDTH });
    // Legend swatches mirror the pins drawn by staticMap (A is outlined, the rest are filled).
    const items: [string, string, string, string][] = [['A', '#ffffff', C.navy, 'titik mulai'], ['B', C.navy, '#ffffff', 'titik selesai']];
    if (input.findings.some(f => !f.emergency)) items.push(['1', C.accent, '#ffffff', 'temuan']);
    if (input.findings.some(f => f.emergency)) items.push(['1', C.danger, '#ffffff', 'temuan darurat']);
    const row = items.flatMap(([glyph, fill, color, caption]) => [
      { text: glyph, fontSize: 7, bold: true, color, fillColor: fill, alignment: 'center', margin: [0, 1, 0, 0] },
      { text: caption, fontSize: 8.5, color: C.muted, margin: [0, 0, 10, 0] },
    ]);
    blocks.push({
      table: { widths: items.flatMap(() => [10, 'auto']), body: [row] },
      layout: {
        hLineWidth: () => 0, vLineWidth: () => 0,
        paddingLeft: (i: number) => (i % 2 ? 4 : 0), paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0,
      },
      margin: [0, 6, 0, 0],
    });
  }
  if (input.map.note) blocks.push({ text: input.map.note, fontSize: 9, color: C.muted, margin: [0, 6, 0, 0] });
  return blocks;
}

function findingsSection(input: ReportInput) {
  const t = input.tracking;
  if (!t) return [{ text: 'Belum ada sesi inspeksi untuk tugas ini.', color: C.muted }];
  if (input.findings.length === 0) {
    return [{ text: t.status === 'started' ? 'Belum ada temuan yang dilaporkan sejauh ini.' : 'Inspeksi selesai tanpa temuan kendala.', color: C.muted }];
  }

  const groups = new Map<string, ReportFinding[]>();
  for (const f of input.findings) groups.set(f.label, [...(groups.get(f.label) ?? []), f]);
  const ordered = [...groups.entries()].sort((a, b) => Number(b[1][0]!.emergency) - Number(a[1][0]!.emergency) || b[1].length - a[1].length);
  const recap = {
    table: {
      headerRows: 1,
      widths: ['*', 80, 50, 110],
      body: [
        headerRow(['Kategori', 'Tingkat', 'Jumlah', 'Nomor temuan']),
        ...ordered.map(([name, list]) => {
          const emergency = list[0]!.emergency;
          return [
            { text: name, bold: emergency, color: emergency ? C.danger : C.ink },
            { text: emergency ? 'Darurat' : 'Biasa', color: emergency ? C.danger : C.ink },
            String(list.length),
            list.map(f => f.no).join(', '),
          ];
        }),
      ],
    },
    layout: tableLayout,
    fontSize: 9,
    margin: [0, 0, 0, 12],
  };

  const details = input.findings.map(f => {
    const color = f.emergency ? C.danger : C.accent;
    const meta = [
      `${fmtClock(f.createdAt)} WIB`,
      ...(f.kmFromStart !== null ? [`km ${num(f.kmFromStart)} dari titik mulai`] : []),
      `${f.lat.toFixed(5)}, ${f.lng.toFixed(5)}`,
    ].join('   |   ');
    const body: any[] = [
      { text: [{ text: f.label, bold: true, color: f.emergency ? C.danger : C.ink }, ...(f.emergency ? [{ text: '   Darurat', bold: true, color: C.danger, fontSize: 9 }] : [])], fontSize: 10.5 },
      { text: meta, fontSize: 8.5, color: C.muted, margin: [0, 1, 0, 4] },
      { text: f.deskripsi?.trim() || 'Tanpa deskripsi.', fontSize: 9.5, color: f.deskripsi?.trim() ? C.ink : C.muted },
    ];
    if (f.foto && !printableImage(f.foto)) body.push({ text: 'Foto tersimpan di aplikasi, formatnya tidak dapat dicetak.', fontSize: 8.5, color: C.muted, margin: [0, 4, 0, 0] });
    // Photo sits beside the text so several findings fit on one page.
    const photo = printableImage(f.foto) ? { image: f.foto, fit: [150, 112], alignment: 'right' } : { text: '' };
    return {
      unbreakable: true,
      table: { widths: [20, '*', 150], body: [[numberBadge(f.no, color), { stack: body }, photo]] },
      layout: {
        hLineWidth: (i: number) => (i === 0 ? 0.5 : 0), vLineWidth: () => 0, hLineColor: () => C.line,
        paddingLeft: (i: number) => (i === 0 ? 0 : 6), paddingRight: () => 0, paddingTop: () => 8, paddingBottom: () => 8,
      },
    };
  });

  return [recap, { text: 'Rincian temuan, berurutan sesuai waktu pelaporan. Nomor sama dengan penanda di peta.', fontSize: 8.5, color: C.muted, margin: [0, 0, 0, 2] }, ...details];
}

function telemetrySection(input: ReportInput) {
  const t = input.tracking;
  if (!t) return [{ text: 'Belum ada data telemetri.', color: C.muted }];
  const threshold = `Indikasi dicatat bila kecepatan di atas ${TELEMETRY.REVIEW_KMH} km/jam bertahan minimal ${TELEMETRY.REVIEW_DURATION_MS / 60000} menit. Ini bahan peninjauan, bukan bukti pelanggaran.`;
  const blocks: any[] = [];
  if (t.testMode) {
    blocks.push({ text: 'Sesi mode uji: indikasi kecepatan tidak dihitung untuk evaluasi.', fontSize: 9, color: C.accent, margin: [0, 0, 0, 6] });
  }
  if (input.speedEvents.length === 0) {
    blocks.push({ text: 'Tidak ada indikasi pergerakan cepat yang tercatat.', fontSize: 9.5, color: C.ink });
  } else {
    blocks.push({
      table: {
        headerRows: 1,
        widths: [24, '*', 80, 80, 80],
        body: [
          headerRow(['No', 'Mulai', 'Durasi', 'Maksimum', 'Rata-rata']),
          ...input.speedEvents.map((e, i) => [String(i + 1), `${fmtClock(e.startAt)} WIB`, formatDuration(Math.round(e.durationMs / 1000)), `${num(e.maxKmh, 1)} km/jam`, `${num(e.meanKmh, 1)} km/jam`]),
        ],
      },
      layout: tableLayout,
      fontSize: 9,
    });
  }
  blocks.push({ text: threshold, fontSize: 8.5, color: C.muted, margin: [0, 6, 0, 10] });
  blocks.push({
    table: {
      widths: [190, '*'],
      body: [
        [{ text: 'Sampel GPS diterima server', color: C.muted }, t.sampleCount.toLocaleString('id-ID')],
        [{ text: 'Sampel tidak terkirim dari perangkat', color: C.muted }, t.reportedLoss.toLocaleString('id-ID')],
        [{ text: 'Titik jejak peta', color: C.muted }, input.route.length.toLocaleString('id-ID')],
      ],
    },
    layout: 'noBorders',
    fontSize: 9,
  });
  const gaps = t.gpsGaps ?? [];
  blocks.push({ text: `GPS terputus (tanpa sampel minimal ${TELEMETRY.GPS_GAP_MS / 60000} menit)`, bold: true, fontSize: 9.5, color: C.ink, margin: [0, 10, 0, 4] });
  if (gaps.length === 0) {
    blocks.push({ text: 'Tidak ada. GPS terkirim terus selama inspeksi.', fontSize: 9, color: C.ink });
  } else {
    const total = gaps.reduce((sum, g) => sum + g.to.getTime() - g.from.getTime(), 0);
    blocks.push({
      table: {
        headerRows: 1,
        widths: [24, '*', '*', 80],
        body: [
          headerRow(['No', 'Dari', 'Sampai', 'Lama']),
          ...gaps.map((g, i) => [String(i + 1), `${fmtClock(g.from)} WIB`, `${fmtClock(g.to)} WIB`, formatDuration(Math.round((g.to.getTime() - g.from.getTime()) / 1000))]),
        ],
      },
      layout: tableLayout,
      fontSize: 9,
    });
    blocks.push({ text: `Total ${formatDuration(Math.round(total / 1000))} tanpa data GPS. Penyebab umum: layar HP mati, aplikasi ditutup, atau tidak ada sinyal. Bagian jalur pada periode ini tidak terpantau.`, fontSize: 8.5, color: C.accent, margin: [0, 4, 0, 0] });
  }
  return blocks;
}

function signOff(input: ReportInput) {
  const t = input.tracking;
  const blocks: any[] = [];
  if (t && (t.fotoAwal || t.fotoSelesai)) {
    const photo = (title: string, src: string | null, when: Date | null) => ({
      stack: [
        label(`${title}${when ? `, ${fmtClock(when)} WIB` : ''}`),
        printableImage(src) ? { image: src, fit: [160, 160], margin: [0, 4, 0, 0] } : { text: src ? 'Format foto tidak dapat dicetak.' : 'Tidak ada foto.', fontSize: 9, color: C.muted, margin: [0, 4, 0, 0] },
      ],
    });
    blocks.push({ columns: [photo('Foto petugas saat mulai', t.fotoAwal, t.startTime), photo('Foto petugas saat selesai', t.fotoSelesai, t.endTime)], columnGap: 20, margin: [0, 0, 0, 16] });
  }
  const signer = (role: string, person: { nama: string; nipp: string } | null, note: string) => ({
    stack: [
      label(role),
      { text: '', margin: [0, 34, 0, 0] },
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 200, y2: 0, lineWidth: 0.6, lineColor: C.ink }] },
      { text: person?.nama ?? ' ', bold: true, fontSize: 10, margin: [0, 4, 0, 0] },
      { text: person ? `NIPP ${person.nipp}` : '', fontSize: 9, color: C.muted },
      { text: note, fontSize: 8.5, color: t?.approved || role.startsWith('Petugas') ? C.muted : C.danger, margin: [0, 2, 0, 0] },
    ],
  });
  blocks.push({
    columns: [
      signer('Petugas pelaksana', input.petugas, t?.forcedStop ? 'Dihentikan paksa oleh pengelola' : t?.endTime ? `Selesai ${fmtShortDate(t.endTime)}, ${fmtClock(t.endTime)} WIB` : ''),
      signer('Disetujui oleh', t?.approved ? t.approver : null, t?.approved && t.approvedAt ? `Disetujui ${fmtShortDate(t.approvedAt)}, ${fmtClock(t.approvedAt)} WIB` : 'Belum disetujui admin'),
    ],
    columnGap: 40,
  });
  // Photos and signatures are one attestation; keep them on the same page.
  return [{ stack: blocks, unbreakable: true }];
}

// ---------- document ----------

export function buildInspectionReport(input: ReportInput): any {
  const number = reportNumber(input.id);
  const printed = `${fmtShortDate(input.printedAt)}, ${fmtClock(input.printedAt)} WIB`;
  let count = 0;
  const next = (title: string, blocks: any[]) => section(++count, title, blocks);

  return {
    pageSize: 'A4',
    pageMargins: [40, 52, 40, 48],
    info: { title: `Laporan Inspeksi Jalur ${number}`, author: input.petugas.nama, subject: input.jalur },
    defaultStyle: { font: 'Helvetica', fontSize: 9.5, lineHeight: 1.25, color: C.ink },
    header: (page: number) => (page === 1 ? null : {
      margin: [40, 22, 40, 0],
      stack: [
        { columns: [{ text: 'Laporan Inspeksi Jalur', bold: true, fontSize: 8.5, color: C.navy }, { text: `${number}   |   ${input.jalur}`, fontSize: 8.5, color: C.muted, alignment: 'right' }] },
        rail(C.line, PAGE_WIDTH, [0, 4, 0, 0]),
      ],
    }),
    footer: (page: number, pages: number) => ({
      margin: [40, 16, 40, 0],
      columns: [
        { text: `${number}, dicetak ${printed}`, fontSize: 8, color: C.muted },
        { text: `Halaman ${page} dari ${pages}`, fontSize: 8, color: C.muted, alignment: 'right' },
      ],
    }),
    content: [
      ...letterhead(input),
      verdict(input),
      metrics(input),
      ...next('Identitas tugas', [identity(input)]),
      ...next('Rencana dan realisasi', [planVsActual(input)]),
      ...next('Peta jalur inspeksi', mapSection(input)),
      ...next('Temuan', findingsSection(input)),
      ...next('Kecepatan dan kualitas data GPS', telemetrySection(input)),
      ...next('Verifikasi dan pengesahan', signOff(input)),
    ],
  };
}
