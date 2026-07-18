import assert from 'node:assert/strict';
import test from 'node:test';
import { findStationMatch, normalizeNipp, normalizeStationName } from './importMatching';

const stations = [
  { name: 'Sta. Lempuyangan' },
  { name: 'Sta. Yogyakarta' },
  { name: 'Sta. Solo Balapan' },
  { name: 'Sta. Wojo' },
];

test('NIPP tidak case-sensitive dan mengabaikan spasi', () => {
  assert.equal(normalizeNipp(' kai - 1234 '), normalizeNipp('KAI-1234'));
});

test('nama stasiun mengabaikan kapital, spasi, tanda baca, dan prefiks', () => {
  assert.equal(normalizeStationName('  STASIUN   SOLO-BALAPAN '), 'solobalapan');
  assert.equal(findStationMatch('  lempuyangan ', stations)?.station.name, 'Sta. Lempuyangan');
});

test('typo kecil tetap dipetakan ke stasiun kanonis', () => {
  for (const typo of ['lempuyungan', 'lempunyangan']) {
    const match = findStationMatch(typo, stations);
    assert.equal(match?.station.name, 'Sta. Lempuyangan');
    assert.equal(match?.distance, 1);
  }
});

test('teks yang terlalu berbeda tidak dipaksakan ke suatu stasiun', () => {
  assert.equal(findStationMatch('stasiun tidak dikenal', stations), null);
});
