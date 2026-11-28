import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import prisma from '../config/database';
import { requireAuth } from '../middleware/auth.middleware';
import { scheduleProblem } from '../utils/assignmentValidation';
import { generateToken } from '../utils/jwt';
import { createTugas } from './assignment.controller';
import { approveTracking, rejectTracking, startTracking, stopTracking } from './tracking.controller';
const signaturePng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAwS2OUAAAAABJRU5ErkJggg==';

process.env.JWT_SECRET = 'unit-test-jwt-secret-with-32-characters-minimum';
const db = prisma as any;
const saved: [any, string, unknown][] = [];
const stub = (target: any, key: string, fn: unknown) => { saved.push([target, key, target[key]]); target[key] = fn; };
afterEach(() => { for (const [target, key, fn] of saved.splice(0).reverse()) target[key] = fn; });
const response = () => ({ statusCode: 200, body: null as any, status(code: number) { this.statusCode = code; return this; }, json(body: any) { this.body = body; return this; } } as any);
const photo = 'data:image/jpeg;base64,AAAA';

test('reject needs a reason, is scoped to the manager and closes the task as rejected', async () => {
  stub(db, '$transaction', async () => assert.fail('must not open a transaction'));
  const empty = response();
  await rejectTracking({ params: { id: '40' }, user: { id: 9 }, body: { reason: 'x' } } as any, empty);
  assert.equal(empty.statusCode, 400);

  const writes: any = {};
  stub(db, '$transaction', async (fn: any) => fn({
    tracking: {
      findFirst: async (args: any) => { writes.scope = args.where; return { tugasId: 5 }; },
      updateMany: async (args: any) => { writes.tracking = args; return { count: 1 }; },
    },
    tugasPpj: { updateMany: async (args: any) => { writes.task = args; return { count: 1 }; } },
    adminAuditLog: { create: async (args: any) => { writes.audit = args.data.action; } },
  }));
  const res = response();
  await rejectTracking({ params: { id: '40' }, user: { id: 9 }, body: { reason: 'Foto akhir bukan di titik akhir' } } as any, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(writes.scope.tugas, { user: { managerId: 9 } });
  assert.equal(writes.tracking.data.approvalStatus, 'rejected');
  assert.equal(writes.tracking.data.rejectionReason, 'Foto akhir bukan di titik akhir');
  assert.deepEqual(writes.task.data, { status: 'rejected' });
  assert.equal(writes.audit, 'tracking.reject');
});

test('normal stop outside the end geofence needs a reason, and keeps it', async () => {
  process.env.TRACKING_BYPASS_ENABLED = 'false';
  stub(db.tracking, 'findFirst', async () => ({ id: 40, tugasId: 5, startTime: new Date(Date.now() - 60_000), tugas: { endPointLat: -7.9, endPointLong: 110.1 } }));
  const body = { lat: -7.8, lng: 110.0, fotoSelesai: photo, ttdPetugas: signaturePng, routePath: [[-7.8, 110], [-7.81, 110.01]] };
  const refused = response();
  await stopTracking({ params: { id: '40' }, user: { id: 7 }, body } as any, refused);
  assert.equal(refused.statusCode, 400);

  let stored: any;
  stub(db, '$transaction', async (fn: any) => fn({
    $queryRaw: async () => [],
    tracking: {
      findFirst: async () => ({ id: 40, startTime: new Date(), telemetryState: null, telemetryTest: false, positionCapturedAt: null, telemetryLoss: 0 }),
      updateMany: async (args: any) => { stored = args.data; return { count: 1 }; },
    },
    laporan: { count: async () => 0 },
    tugasPpj: { updateMany: async () => ({ count: 1 }) },
  }));
  const res = response();
  await stopTracking({ params: { id: '40' }, user: { id: 7 }, body: { ...body, earlyStopReason: 'Jalur tertutup longsor KM 12' } } as any, res);
  delete process.env.TRACKING_BYPASS_ENABLED;
  assert.equal(res.statusCode, 200);
  assert.equal(stored.earlyStopReason, 'Jalur tertutup longsor KM 12');
  assert.equal(stored.ttdPetugas, signaturePng);
});

test('a PPJ cannot start a second inspection while one is running', async () => {
  stub(db.tugasPpj, 'findFirst', async () => ({ id: 12, assignedTo: 7, status: 'pending', jamMulai: null, tanggal: new Date() }));
  stub(db, '$transaction', async (fn: any) => fn({
    $queryRaw: async () => [{ is_active: 1 }],
    tugasPpj: { count: async () => 1, updateMany: async () => assert.fail('must not claim') },
  }));
  const res = response();
  await startTracking({ params: { tugasId: '12' }, user: { id: 7 }, body: { lat: -7.8, lng: 110.3, bypassMode: true } } as any, res);
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.code, 'ANOTHER_TRACKING_ACTIVE');
});

test('a password change ends sessions opened with the old token version', async () => {
  stub(db.user, 'findUnique', async () => ({ id: 12, role: 'ppj', isActive: true, tokenVersion: 1 }));
  const res = response();
  await requireAuth({ headers: { authorization: `Bearer ${generateToken(12, 'ppj', 0)}` } } as any, res, () => assert.fail('must not authorize'));
  assert.equal(res.statusCode, 401);
  let ok = false;
  await requireAuth({ headers: { authorization: `Bearer ${generateToken(12, 'ppj', 1)}` } } as any, response(), () => { ok = true; });
  assert.equal(ok, true);
});

test('schedule rules: start time required, end after start, start window not already closed', () => {
  const now = new Date('2026-11-26T05:00:00Z'); // 12:00 WIB
  const today = new Date('2026-11-26T00:00:00Z');
  assert.equal(scheduleProblem(today, null, null, now), 'Jam mulai wajib diisi');
  assert.match(scheduleProblem(today, '14:00', '13:00', now)!, /Jam selesai/);
  assert.match(scheduleProblem(today, '08:00', '16:00', now)!, /sudah lewat/); // window closed at 09:00
  assert.equal(scheduleProblem(today, '11:30', '16:00', now), null); // still inside the window
  assert.match(scheduleProblem(new Date('2026-11-25T00:00:00Z'), '16:00', null, now)!, /sudah lewat/);
});

test('a manual assignment identical to an existing one is refused', async () => {
  stub(db.user, 'findFirst', async () => ({ id: 20 }));
  let locked = false;
  stub(db, '$transaction', async (fn: any) => fn({
    $queryRaw: async () => { locked = true; return []; },
    tugasPpj: { findFirst: async () => ({ id: 3 }), findMany: async () => [], create: async () => assert.fail('must not create') },
  }));
  const res = response();
  await createTugas({ body: { jalur: 'Jenar → Wojo', tanggal: '2099-12-01', assignedTo: 20, startPointName: 'Sta. Jenar', endPointName: 'Sta. Wojo', jamMulai: '08:00' }, user: { id: 1, role: 'admin' } } as any, res);
  assert.equal(res.statusCode, 409);
  assert.equal(locked, true, 'the PPJ row is locked before the duplicate check');
});

test('a manual assignment whose hours overlap another task of the same PPJ is refused', async () => {
  stub(db.user, 'findFirst', async () => ({ id: 20 }));
  stub(db, '$transaction', async (fn: any) => fn({
    $queryRaw: async () => [],
    tugasPpj: {
      findFirst: async () => null,
      findMany: async () => [{ id: 4, jalur: 'Sta. Yogyakarta → Sta. Lempuyangan', jamMulai: '09:00', jamSelesai: '11:00' }],
      create: async () => assert.fail('must not create'),
    },
  }));
  const res = response();
  await createTugas({ body: { jalur: 'Jenar → Wojo', tanggal: '2099-12-01', assignedTo: 20, startPointName: 'Sta. Jenar', endPointName: 'Sta. Wojo', jamMulai: '08:00', jamSelesai: '10:00' }, user: { id: 1, role: 'admin' } } as any, res);
  assert.equal(res.statusCode, 409);
  assert.match(res.body.message, /Jadwal bentrok dengan tugas "Sta. Yogyakarta → Sta. Lempuyangan" pukul 09:00–11:00/);
});

test('normal stop without the PPJ signature is refused before any write', async () => {
  process.env.TRACKING_BYPASS_ENABLED = 'false';
  stub(db.tracking, 'findFirst', async () => assert.fail('must validate first'));
  const res = response();
  await stopTracking({ params: { id: '40' }, user: { id: 7 }, body: { lat: -7.8, lng: 110.0, fotoSelesai: photo } } as any, res);
  delete process.env.TRACKING_BYPASS_ENABLED;
  assert.equal(res.statusCode, 400);
  assert.match(res.body.message, /Tanda tangan petugas wajib/);
});

test('approval without the approver signature is refused before any write', async () => {
  stub(db.tracking, 'findFirst', async () => assert.fail('must validate first'));
  for (const ttdApprover of [undefined, 'data:image/jpeg;base64,/9j/']) {
    const res = response();
    await approveTracking({ params: { id: '40' }, user: { id: 1 }, body: { safetyStatus: 'aman', ttdApprover } } as any, res);
    assert.equal(res.statusCode, 400);
  }
});

test('a rejected or missed task does not block re-assigning the same hours', async () => {
  stub(db.user, 'findFirst', async () => ({ id: 20 }));
  let where: any;
  stub(db, '$transaction', async (fn: any) => fn({
    $queryRaw: async () => [],
    tugasPpj: {
      findFirst: async () => null,
      findMany: async (args: any) => { where = args.where; return []; },
      create: async (args: any) => ({ id: 9, ...args.data }),
    },
  }));
  const res = response();
  await createTugas({ body: { jalur: 'Jenar → Wojo', tanggal: '2099-12-01', assignedTo: 20, startPointName: 'Sta. Jenar', endPointName: 'Sta. Wojo', jamMulai: '08:00', jamSelesai: '10:00' }, user: { id: 1, role: 'admin' } } as any, res);
  assert.equal(res.statusCode, 201);
  for (const status of ['rejected', 'missed', 'cancelled']) assert.ok(where.status.notIn.includes(status), status);
});
