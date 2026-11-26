import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reviewFlags, type ReviewInput } from './qcReview';

// Sta. Jenar -> Sta. Wojo, sekitar 8 km garis lurus: taksiran 2 jam, batas singkat 1 jam.
const base: ReviewInput = {
  start: { lat: -7.802037, lng: 110.000797 }, end: { lat: -7.862278, lng: 110.041092 },
  durasiSec: 2 * 3600, stopLat: -7.862278, stopLng: 110.041092,
  earlyStopReason: null, forcedStopAt: null, speedEventCount: 0, longestGapSec: 0,
};

test('patroli wajar tidak ditandai', () => {
  assert.deepEqual(reviewFlags(base), []);
});

test('durasi di bawah separuh taksiran ditandai singkat', () => {
  assert.deepEqual(reviewFlags({ ...base, durasiSec: 40 * 60 }), ['durasi_singkat']);
  assert.deepEqual(reviewFlags({ ...base, durasiSec: 70 * 60 }), []);
});

test('jalur pendek tetap ditandai bila selesai di bawah 10 menit', () => {
  const short = { ...base, end: base.start, stopLat: base.start.lat, stopLng: base.start.lng };
  assert.deepEqual(reviewFlags({ ...short, durasiSec: 5 * 60 }), ['durasi_singkat']);
  assert.deepEqual(reviewFlags({ ...short, durasiSec: 15 * 60 }), []);
});

test('kecepatan, GPS hilang, dan henti paksa ditandai', () => {
  assert.deepEqual(reviewFlags({ ...base, speedEventCount: 2, longestGapSec: 300, forcedStopAt: new Date() }),
    ['kecepatan_tinggi', 'gps_hilang', 'dihentikan_paksa']);
  assert.deepEqual(reviewFlags({ ...base, longestGapSec: 299 }), []);
});

test('berhenti jauh dari titik akhir ditandai, kecuali sudah memberi alasan berhenti awal', () => {
  const far = { ...base, stopLat: base.start.lat, stopLng: base.start.lng };
  assert.deepEqual(reviewFlags(far), ['jauh_dari_akhir']);
  assert.deepEqual(reviewFlags({ ...far, earlyStopReason: 'Rel tertutup longsor' }), ['berhenti_awal']);
});

test('sesi tanpa durasi tidak ditandai singkat', () => {
  assert.deepEqual(reviewFlags({ ...base, durasiSec: null }), []);
});
