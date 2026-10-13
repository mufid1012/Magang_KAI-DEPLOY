import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hasOverlappingWarningRoute, selectWarningRecipients } from './warningRoute';

const now = new Date('2026-10-13T05:00:00Z');
const route = { startPointName: 'Sta. A', endPointName: 'Sta. B', startPointLat: -7, startPointLong: 110, endPointLat: -7, endPointLong: 111 };
const sender = { userId: 1, latitude: -7, longitude: 110.5 };
const candidate = (id: number, longitude: number) => ({ id, userId: id, latitude: -7, longitude, updatedAt: now, tugas: route });

for (const [label, startPointName, endPointName, expected] of [
  ['identical routes', 'Sta. A', 'Sta. B', true],
  ['reversed routes', 'B', 'A', true],
  ['end to start overlap', 'B', 'C', true],
  ['start to end overlap', 'C', 'A', true],
  ['same starts', 'A', 'C', true],
  ['same ends', 'C', 'B', true],
  ['disjoint routes', 'C', 'D', false],
] as const) {
  test(`route overlap: ${label}`, () => {
    const other = { startPointName, endPointName };
    assert.equal(hasOverlappingWarningRoute(route, other), expected);
    assert.equal(hasOverlappingWarningRoute(other, route), expected);
  });
}

test('overlap normalizes station prefixes, punctuation, spaces and casing', () => {
  assert.equal(hasOverlappingWarningRoute(
    { startPointName: 'Sta. Lempuyangan', endPointName: 'Sta. Yogyakarta' },
    { startPointName: ' yogyakarta ', endPointName: 'Sta. Maguwo' },
  ), true);
});

test('missing or empty stations on either route never overlap', () => {
  for (const value of [null, '', ' ', 'Sta.']) {
    for (const incomplete of [
      { startPointName: value, endPointName: 'B' },
      { startPointName: 'A', endPointName: value },
    ]) {
      assert.equal(hasOverlappingWarningRoute(route, incomplete), false);
      assert.equal(hasOverlappingWarningRoute(incomplete, route), false);
    }
  }
});

test('selects one nearest PPJ on each side even beyond 1 km', () => {
  assert.deepEqual(selectWarningRecipients(sender, route, [candidate(2, 110.4), candidate(3, 110.2), candidate(4, 110.6), candidate(5, 110.8)], now).sort(), [2, 4]);
});

test('ignores sender, stale GPS, invalid GPS, and different routes; allows reversed station names', () => {
  const reversed = { ...candidate(6, 110.7), tugas: { ...route, startPointName: 'B', endPointName: 'A' } };
  const result = selectWarningRecipients(sender, route, [
    candidate(1, 110.51),
    { ...candidate(2, 110.52), updatedAt: new Date(now.getTime() - 120001) },
    { ...candidate(3, 110.53), latitude: NaN },
    { ...candidate(4, 110.54), tugas: { ...route, startPointName: 'C', endPointName: 'D' } },
    { ...candidate(5, 110.55), updatedAt: new Date(now.getTime() + 1) },
    reversed,
  ], now);
  assert.deepEqual(result, [6]);
});

test('one occupied side yields only one recipient; duplicate sessions use latest position', () => {
  assert.deepEqual(selectWarningRecipients(sender, route, [candidate(2, 110.6), candidate(3, 110.7)], now), [2]);
  assert.deepEqual(selectWarningRecipients(sender, route, [candidate(2, 110.6), { ...candidate(3, 110.4), userId: 2, updatedAt: new Date(now.getTime() - 1000) }], now), [2]);
});

test('invalid route direction produces no recipient', () => {
  assert.deepEqual(selectWarningRecipients(sender, { ...route, endPointLong: 110 }, [candidate(2, 110.6)], now), []);
});

test('overlapping routes receive warnings even on a side occupied by the exact route', () => {
  const connecting = { ...candidate(3, 110.7), tugas: { startPointName: 'B', endPointName: 'C' } };
  assert.deepEqual(selectWarningRecipients(sender, route, [candidate(2, 110.6), connecting], now), [2, 3]);
});

test('broadcast exceeds two recipients, retaining nearest selection on both sides per route', () => {
  const connectingRoute = { startPointName: 'B', endPointName: 'C' };
  const result = selectWarningRecipients(sender, route, [
    candidate(2, 110.49), candidate(3, 110.51), candidate(4, 110.6),
    { ...candidate(5, 110.48), tugas: connectingRoute },
    { ...candidate(6, 110.52), tugas: { startPointName: 'Sta. C', endPointName: 'Stasiun B' } },
    { ...candidate(7, 110.47), tugas: connectingRoute },
    { ...candidate(8, 110.501), tugas: { startPointName: 'C', endPointName: 'D' } },
  ], now);
  assert.deepEqual(result.slice().sort((a, b) => a - b), [2, 3, 5, 6]);
});

test('GPS exactly two minutes old remains eligible and duplicate users span only one route', () => {
  assert.deepEqual(selectWarningRecipients(sender, route, [
    { ...candidate(2, 110.6), updatedAt: new Date(now.getTime() - 120_000) },
  ], now), [2]);
  assert.deepEqual(selectWarningRecipients(sender, route, [
    candidate(2, 110.6),
    { ...candidate(3, 110.4), userId: 2, tugas: { startPointName: 'B', endPointName: 'C' }, updatedAt: new Date(now.getTime() - 1) },
  ], now), [2]);
});
