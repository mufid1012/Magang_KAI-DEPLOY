import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import prisma from '../config/database';
import { approveTracking, createNearbyWarning, getNearbyWarnings, stopTracking } from './tracking.controller';

const route = { startPointLat: -7.8, startPointLong: 110.3, endPointLat: -7.8, endPointLong: 110.5, startPointName: 'Sta. Yogyakarta', endPointName: 'Sta. Lempuyangan' };
const request = () => ({ user: { id: 7 }, query: { tugasId: '12', lat: '-7.8', lng: '110.37' }, body: { tugasId: 12, lat: -7.8, lng: 110.37 } } as any);
function response() {
  return { statusCode: 200, body: null as any, status(code: number) { this.statusCode = code; return this; }, json(body: any) { this.body = body; return this; } } as any;
}
const restores: (() => void)[] = [];
function stub(target: any, method: string, implementation: any) {
  const original = target[method];
  target[method] = implementation;
  restores.push(() => { target[method] = original; });
}
afterEach(() => { restores.splice(0).reverse().forEach(restore => restore()); });

test('nearby warnings use the sender final destination as the train direction', async () => {
  stub(prisma.tracking, 'findFirst', async (args: any) => {
    assert.equal(args.where.tugasId, 12);
    assert.equal(args.where.tugas.assignedTo, 7);
    assert.equal(args.where.status, 'started');
    assert.equal(args.where.tugas.status, 'in_progress');
    return { id: 42, tugas: route };
  });
  const warning = { latitude: -7.8, longitude: 110.37, creator: { nama: 'PPJ' } };
  stub(prisma.warningAlert, 'findMany', async (args: any) => {
    assert.deepEqual(args.where.OR, [{ recipientOneTrackingId: 42 }, { recipientTwoTrackingId: 42 }]);
    assert.equal(args.where.latitude, undefined);
    return [
    { ...warning, ...route, id: 1 },
    { ...warning, startPointName: 'lempuyangan', endPointName: 'Stasiun Yogyakarta', id: 2 },
    { ...warning, ...route, endPointName: 'Solo Balapan', id: 3 },
    { ...warning, startPointName: null, endPointName: null, id: 4 },
    { ...warning, ...route, latitude: -7.9, id: 5 },
  ]; });
  const res = response();
  await getNearbyWarnings(request(), res);
  assert.deepEqual(res.body.data.map((item: any) => item.id), [1, 2, 5]);
  assert.equal(res.body.data[0].startPointName, route.startPointName);
  assert.equal(res.body.data[0].trainDirectionName, route.endPointName);
  assert.equal(res.body.data[1].trainDirectionName, 'Stasiun Yogyakarta');
});

test('PPJ without active tracking receives no warning', async () => {
  stub(prisma.tracking, 'findFirst', async () => null);
  const res = response();
  await getNearbyWarnings(request(), res);
  assert.deepEqual(res.body.data, []);
});

test('sending warning snapshots station names from owned active task', async () => {
  stub(prisma.tracking, 'findFirst', async (args: any) => {
    assert.equal(args.where.tugasId, 12);
    assert.equal(args.where.tugas.assignedTo, 7);
    return { id: 42, tugas: route };
  });
  stub(prisma.tracking, 'findMany', async (args: any) => {
    assert.equal(args.where.status, 'started');
    assert.ok(args.where.updatedAt.gte instanceof Date);
    return [{ id: 55, endLat: -7.8, endLong: 110.4, updatedAt: new Date(Date.now() - 100), tugas: { ...route, assignedTo: 8 } }];
  });
  stub(prisma.warningAlert, 'findFirst', async () => null);
  stub(prisma.warningAlert, 'deleteMany', async () => ({ count: 0 }));
  stub(prisma.warningAlert, 'create', async ({ data }: any) => {
    assert.equal(data.recipientOneTrackingId, 55);
    assert.equal(data.recipientTwoTrackingId, null);
    assert.equal(data.startPointName, route.startPointName);
    assert.equal(data.endPointName, route.endPointName);
    return { id: 8, ...data };
  });
  const res = response();
  await createNearbyWarning(request(), res);
  assert.equal(res.statusCode, 201);
  assert.match(res.body.message, /Sta. Yogyakarta ke Sta. Lempuyangan/);
});

test('sending warning rejects a task without station names', async () => {
  stub(prisma.tracking, 'findFirst', async () => ({ tugas: { startPointName: null, endPointName: null } }));
  const res = response();
  await createNearbyWarning(request(), res);
  assert.equal(res.statusCode, 400);
});

test('no eligible recipient reports failure without saving a warning', async () => {
  stub(prisma.tracking, 'findFirst', async () => ({ id: 42, tugas: route }));
  stub(prisma.tracking, 'findMany', async () => []);
  stub(prisma.warningAlert, 'findFirst', async () => null);
  stub(prisma.warningAlert, 'create', async () => { assert.fail('must not save'); });
  const res = response();
  await createNearbyWarning(request(), res);
  assert.equal(res.statusCode, 400);
  assert.match(res.body.message, /Tidak ada PPJ/);
});

test('sending warning identifies a deployment missing the warning-route schema', async () => {
  stub(prisma.tracking, 'findFirst', async () => ({ id: 42, tugas: route }));
  stub(prisma.tracking, 'findMany', async () => [{
    id: 55,
    endLat: -7.8,
    endLong: 110.4,
    updatedAt: new Date(Date.now() - 100),
    tugas: { ...route, assignedTo: 8 },
  }]);
  stub(prisma.warningAlert, 'findFirst', async () => null);
  stub(prisma.warningAlert, 'deleteMany', async () => ({ count: 0 }));
  stub(prisma.warningAlert, 'create', async () => {
    throw { code: 'P2022', meta: { modelName: 'WarningAlert' } };
  });

  const res = response();
  await createNearbyWarning(request(), res);

  assert.equal(res.statusCode, 503);
  assert.equal(res.body.code, 'WARNING_SCHEMA_OUTDATED');
  assert.match(res.body.message, /Perbarui skema database/);
});

test('stopping tracking moves the assignment to need approval', async () => {
  stub(prisma.tracking, 'findFirst', async (args: any) => {
    assert.equal(args.where.id, 91);
    assert.equal(args.where.tugas.assignedTo, 7);
    return { id: 91, tugasId: 12, startTime: new Date(Date.now() - 60_000) };
  });
  const tx = {
    laporan: { count: async () => 0 },
    tracking: { updateMany: async ({ data }: any) => {
      assert.equal(data.status, 'stopped');
      assert.equal(data.approvalStatus, 'not_approved');
      return { count: 1 };
    } },
    tugasPpj: { updateMany: async ({ where, data }: any) => {
      assert.equal(where.id, 12);
      assert.equal(where.assignedTo, 7);
      assert.equal(data.status, 'need_approval');
      return { count: 1 };
    } },
  };
  stub(prisma, '$transaction', async (operation: any) => operation(tx));
  const req = { params: { id: '91' }, body: { lat: -7.8, lng: 110.37 }, user: { id: 7 } } as any;
  const res = response();
  await stopTracking(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
});

test('approving tracking atomically completes the assignment', async () => {
  stub(prisma.tracking, 'findFirst', async () => ({ id: 91, tugasId: 12, status: 'stopped', approvalStatus: 'not_approved' }));
  stub(prisma.tracking, 'update', async ({ data }: any) => {
    assert.equal(data.approvalStatus, 'approved');
    assert.equal(data.safetyStatus, 'aman');
    return { id: 91, ...data };
  });
  stub(prisma.tugasPpj, 'update', async ({ where, data }: any) => {
    assert.equal(where.id, 12);
    assert.equal(data.status, 'completed');
    return { id: 12, ...data };
  });
  stub(prisma, '$transaction', async (operations: Promise<any>[]) => Promise.all(operations));
  const req = { params: { id: '91' }, body: { safetyStatus: 'aman' }, user: { id: 7 } } as any;
  const res = response();
  await approveTracking(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.tugasStatus, 'completed');
});
