import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildInspectionReport, distanceAlongRouteKm, reportRoute, routeLengthKm, scheduleGap, summarySentence, type ReportInput } from './inspectionReport';
import { planMapView, worldPixel, type LatLng } from './staticMap';

const route: LatLng[] = [[-6.9147, 107.6098], [-6.918, 107.62], [-6.921, 107.635], [-6.925, 107.65]];

function input(overrides: Partial<ReportInput> = {}): ReportInput {
  return {
    id: 12,
    jalur: 'Bandung - Kiaracondong',
    tanggal: new Date('2026-11-14T00:00:00Z'),
    jamMulai: '08:00',
    jamSelesai: '10:00',
    startPoint: { name: 'Sta. Bandung', lat: -6.9147, lng: 107.6098 },
    endPoint: { name: 'Sta. Kiaracondong', lat: -6.925, lng: 107.65 },
    petugas: { nama: 'Petugas Uji', nipp: '000001', jabatan: null, unit: null },
    tracking: {
      status: 'stopped', startTime: new Date('2026-11-14T01:10:00Z'), endTime: new Date('2026-11-14T02:20:00Z'), durasi: 4200,
      start: { lat: -6.9147, lng: 107.6098 }, end: { lat: -6.925, lng: 107.65 }, fotoAwal: null, fotoSelesai: null,
      approved: false, approvedAt: null, approver: null, unsafe: true, testMode: false, reportedLoss: 0, sampleCount: 10, averageKmh: 3.2,
    },
    route,
    map: { image: null, note: null },
    findings: [
      { no: 1, label: 'Bantalan retak', emergency: false, createdAt: new Date('2026-11-14T01:30:00Z'), lat: -6.918, lng: 107.62, deskripsi: 'Retak rambut', foto: null, kmFromStart: 1.15 },
      { no: 2, label: 'Rel patah', emergency: true, createdAt: new Date('2026-11-14T01:50:00Z'), lat: -6.921, lng: 107.635, deskripsi: '', foto: 'data:image/webp;base64,AAAA', kmFromStart: 2.8 },
    ],
    speedEvents: [],
    logo: null,
    printedAt: new Date('2026-11-14T03:00:00Z'),
    ...overrides,
  };
}

test('laporan tidak memakai em dash dan memuat semua bagian', () => {
  const json = JSON.stringify(buildInspectionReport(input()));
  assert.ok(!json.includes('—'));
  for (const heading of ['Identitas tugas', 'Rencana dan realisasi', 'Peta jalur inspeksi', 'Temuan', 'Kecepatan dan kualitas data GPS', 'Verifikasi dan pengesahan']) {
    assert.ok(json.includes(heading), heading);
  }
  assert.ok(json.includes('Draft, belum disetujui'));
  assert.ok(json.includes('formatnya tidak dapat dicetak'), 'foto webp tidak disematkan sebagai gambar');
});

test('kalimat ringkasan menghitung temuan darurat', () => {
  assert.match(summarySentence(input()), /mencatat 2 temuan, 1 di antaranya darurat/);
  assert.match(summarySentence(input({ tracking: null })), /belum dimulai/);
  assert.match(summarySentence(input({ findings: [] })), /tidak mencatat temuan/);
  const noTrail = summarySentence(input({ route: [], tracking: { ...input().tracking!, durasi: 0 } }));
  assert.equal(noTrail, 'Petugas menyelesaikan inspeksi dan mencatat 2 temuan, 1 di antaranya darurat.');
  assert.ok(!JSON.stringify(buildInspectionReport(input({ jamMulai: null }))).includes('- WIB'));
});

test('selisih jadwal dihitung dalam zona WIB', () => {
  assert.equal(scheduleGap('08:00', new Date('2026-11-14T01:10:00Z')), '10 menit setelah jadwal');
  assert.equal(scheduleGap('10:00', new Date('2026-11-14T02:20:00Z')), '40 menit sebelum jadwal');
  assert.equal(scheduleGap('08:00', new Date('2026-11-14T02:20:00Z')), '1 jam 20 menit setelah jadwal');
  assert.equal(scheduleGap(null, new Date()), '-');
});

test('jarak rute dan posisi temuan sepanjang rute', () => {
  const total = routeLengthKm(route);
  assert.ok(total > 4 && total < 5);
  assert.equal(distanceAlongRouteKm(route, -6.9147, 107.6098), 0);
  assert.ok(Math.abs(distanceAlongRouteKm(route, -6.925, 107.65)! - total) < 1e-9);
  assert.equal(distanceAlongRouteKm([route[0]!], 0, 0), null);
});

test('rute satu titik tidak digambar sebagai garis tebakan', () => {
  assert.deepEqual(reportRoute({ routePath: JSON.stringify([[-6.925, 107.65]]), startLat: -6.9147, startLong: 107.6098 }), []);
  const full = reportRoute({ routePath: JSON.stringify(route.slice(1)), startLat: -6.9147, startLong: 107.6098 });
  assert.deepEqual(full, route);
});

test('zoom peta memuat semua titik di dalam bingkai', () => {
  const width = 690, height = 380, padding = 36;
  const view = planMapView(route, width, height, padding);
  for (const [lat, lng] of route) {
    const [x, y] = worldPixel(lat, lng, view.zoom);
    assert.ok(x - view.left >= padding - 1 && x - view.left <= width - padding + 1, `x ${x - view.left}`);
    assert.ok(y - view.top >= padding - 1 && y - view.top <= height - padding + 1, `y ${y - view.top}`);
  }
});

test('pdfmake dapat merender laporan', async () => {
  const pdfmake = require('pdfmake');
  pdfmake.fonts = { Helvetica: { normal: 'Helvetica', bold: 'Helvetica-Bold', italics: 'Helvetica-Oblique', bolditalics: 'Helvetica-BoldOblique' } };
  const buffer: Buffer = await pdfmake.createPdf(buildInspectionReport(input())).getBuffer();
  assert.equal(buffer.subarray(0, 4).toString(), '%PDF');
});

test('laporan mencantumkan periode GPS terputus', () => {
  const base = input();
  const gap = { from: new Date('2026-11-14T01:30:00Z'), to: new Date('2026-11-14T01:47:00Z') };
  const json = JSON.stringify(buildInspectionReport(input({ tracking: { ...base.tracking!, gpsGaps: [gap] } })));
  assert.match(json, /08.30 WIB/); assert.match(json, /08.47 WIB/); // id-ID may print 08.30
  assert.ok(json.includes('Bagian jalur pada periode ini tidak terpantau'));
  assert.ok(JSON.stringify(buildInspectionReport(base)).includes('GPS terkirim terus'));
});

test('tanda tangan online tampil di blok pengesahan; tanpa tanda tangan tetap ruang kosong', async () => {
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAwS2OUAAAAABJRU5ErkJggg==';
  const base = input().tracking!;
  const signed = JSON.stringify(buildInspectionReport(input({ tracking: { ...base, approved: true, approvedAt: new Date('2026-11-14T03:00:00Z'), approver: { nama: 'Admin', nipp: '1' }, ttdPetugas: png, ttdApprover: png } })));
  assert.equal(signed.split(png).length - 1, 2);
  const unsigned = JSON.stringify(buildInspectionReport(input()));
  assert.ok(!unsigned.includes('data:image/png'));
});
