import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import prisma from '../config/database';
import { FORCE_STOPPED_CODE, gpsGaps, lockTracking } from '../lib/telemetry';
import { forceStopTracking, stopTracking } from './tracking.controller';

const db = prisma as any;
const originalTransaction = db.$transaction;
afterEach(() => { db.$transaction = originalTransaction; });

const response = () => ({
  statusCode: 200, body: null as any,
  status(code: number) { this.statusCode = code; return this; },
  json(body: any) { this.body = body; return this; },
} as any);
const request = (body: any = { reason: 'HP petugas mati sejak 10.15' }, user = { id: 9, role: 'kupt' }) => ({ params: { id: '40' }, user, body } as any);

function tx(options: { tracking?: any; trackingCount?: number; taskCount?: number } = {}) {
  const writes: any = {};
  const client = {
    $queryRaw: async () => [],
    tracking: {
      findFirst: async (args: any) => { writes.scope = args.where; return options.tracking === undefined ? {
        id: 40, tugasId: 5, startTime: new Date('2026-11-15T01:00:00Z'), startLat: -7.8, startLong: 110.0, endLat: null, endLong: null,
      } : options.tracking; },
      updateMany: async (args: any) => { writes.tracking = args; return { count: options.trackingCount ?? 1 }; },
    },
    trackingSample: {
      findMany: async () => [{ latitude: -7.8, longitude: 110.0 }, { latitude: -7.81, longitude: 110.01 }],
      findFirst: async () => ({ capturedAt: new Date('2026-11-15T02:30:00Z'), latitude: -7.81, longitude: 110.01 }),
    },
    laporan: { count: async () => 1 },
    tugasPpj: { updateMany: async (args: any) => { writes.task = args; return { count: options.taskCount ?? 1 }; } },
    adminAuditLog: { create: async (args: any) => { writes.audit = args.data; } },
  };
  db.$transaction = async (fn: any) => fn(client);
  return writes;
}

test('force stop needs a reason before touching the database', async () => {
  db.$transaction = async () => assert.fail('must not open a transaction');
  for (const reason of [undefined, '', 'hp', 'x'.repeat(501)]) {
    const res = response();
    await forceStopTracking(request({ reason }), res);
    assert.equal(res.statusCode, 400);
  }
});

test('force stop is scoped to the manager and closes the session from server GPS samples', async () => {
  const writes = tx();
  const res = response();
  await forceStopTracking(request(), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.tugasStatus, 'need_approval');
  assert.deepEqual(writes.scope, { id: 40, status: 'started', tugas: { status: 'in_progress', user: { managerId: 9 } } });
  const data = writes.tracking.data;
  assert.deepEqual(writes.tracking.where, { id: 40, status: 'started' });
  assert.equal(data.status, 'stopped');
  assert.equal(data.forcedStopBy, 9);
  assert.equal(data.forcedStopReason, 'HP petugas mati sejak 10.15');
  // Ends at the last received sample, not at the moment the manager pressed the button.
  assert.equal(data.endTime.toISOString(), '2026-11-15T02:30:00.000Z');
  assert.equal(data.durasi, 5400);
  assert.deepEqual(JSON.parse(data.routePath), [[-7.8, 110.0], [-7.81, 110.01]]);
  assert.deepEqual([data.endLat, data.endLong], [-7.81, 110.01]);
  assert.equal(data.safetyStatus, 'tidak_aman');
  assert.equal(data.approvalStatus, 'not_approved');
  assert.deepEqual(writes.task, { where: { id: 5, status: 'in_progress' }, data: { status: 'need_approval' } });
  assert.deepEqual(writes.audit, { actorId: 9, action: 'tracking.force_stop', targetType: 'tracking', targetId: 40, detail: { reason: 'HP petugas mati sejak 10.15' } });
});

test('force stop of a session outside the manager scope or already finished is 404', async () => {
  tx({ tracking: null });
  const res = response();
  await forceStopTracking(request(), res);
  assert.equal(res.statusCode, 404);
});

test('a PPJ stop racing the force stop yields 409 instead of a half-written session', async () => {
  tx({ taskCount: 0 });
  const res = response();
  await forceStopTracking(request(), res);
  assert.equal(res.statusCode, 409);
});

test('PPJ writes to a force-stopped session get a distinct code so the app stops retrying', async () => {
  const client = {
    $queryRaw: async () => [],
    tracking: { findFirst: async (args: any) => (args.where.forcedStopAt ? { id: 40 } : null) },
  };
  await assert.rejects(lockTracking(client as any, 40, 7), (error: any) => error.status === 409 && error.code === FORCE_STOPPED_CODE);
});

test('normal stop without a device route keeps the trail the server received', async () => {
  const writes: any = {};
  const tracking = { id: 40, tugasId: 5, startTime: new Date(Date.now() - 60_000), tugas: { endPointLat: -7.81, endPointLong: 110.01 } };
  const originalFind = db.tracking.findFirst;
  db.tracking.findFirst = async () => tracking;
  db.$transaction = async (fn: any) => fn({
    $queryRaw: async () => [],
    tracking: {
      findFirst: async () => ({ id: 40, startTime: tracking.startTime, telemetryState: null, telemetryTest: true, positionCapturedAt: null, telemetryLoss: 0 }),
      updateMany: async (args: any) => { writes.tracking = args; return { count: 1 }; },
    },
    trackingSample: { findMany: async () => [{ latitude: -7.8, longitude: 110.0 }, { latitude: -7.81, longitude: 110.01 }] },
    laporan: { count: async () => 0 },
    tugasPpj: { updateMany: async () => ({ count: 1 }) },
  });
  try {
    const res = response();
    await stopTracking({ params: { id: '40' }, user: { id: 7, role: 'ppj' }, body: { lat: -7.81, lng: 110.01, bypassMode: true } } as any, res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(JSON.parse(writes.tracking.data.routePath), [[-7.8, 110.0], [-7.81, 110.01]]);
  } finally { db.tracking.findFirst = originalFind; }
});

test('GPS gaps include session edges and ignore short pauses', () => {
  const at = (min: number) => new Date(Date.UTC(2026, 10, 15, 1, min));
  assert.deepEqual(gpsGaps([at(1), at(2), at(10), at(11)], at(0), at(15)), [
    { from: at(2), to: at(10) },
    { from: at(11), to: at(15) },
  ]);
  assert.deepEqual(gpsGaps([], at(0), at(1)), []);
  assert.deepEqual(gpsGaps([], at(0), at(5)), [{ from: at(0), to: at(5) }]);
});
