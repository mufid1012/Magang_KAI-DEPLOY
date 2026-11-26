import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import prisma from '../config/database';
import { addPetugasToManager, createTugas, createUser, deleteTugas, removePetugasFromManager, reorderKategoriTemuan, updateKategoriTemuan, updateUser } from './admin.controller';
import { approveTracking } from './tracking.controller';

const db = prisma as any;
const saved = new Map<string, unknown>();
function mock(model: string, method: string, fn: unknown) {
  const key = `${model}.${method}`;
  if (!saved.has(key)) saved.set(key, model === '$' ? db[method] : db[model][method]);
  // Every transaction may take the user-row lock and write an audit row; tests opt out of neither.
  const wrapped = model === '$' && method === '$transaction' && typeof fn === 'function'
    ? (cb: any, options: any) => (fn as any)((client: any) => cb({ $queryRaw: async () => [{ is_active: 1 }], adminAuditLog: { create: async () => ({}) }, ...client }), options)
    : fn;
  if (model === '$') db[method] = wrapped; else db[model][method] = wrapped;
}
afterEach(() => {
  for (const [key, fn] of saved) {
    const [model, method] = key.split('.') as [string, string];
    if (model === '$') db[method] = fn; else db[model][method] = fn;
  }
  saved.clear();
});

const response = () => ({
  statusCode: 200, body: null as any,
  status(code: number) { this.statusCode = code; return this; },
  json(body: any) { this.body = body; return this; },
} as any);
const call = async (handler: any, req: any) => { const res = response(); await handler(req, res); return res; };
const noWrites = () => assert.fail('must not write');

test('approval is a conditional claim scoped to the approving manager (admin or KUPT)', async () => {
  mock('tracking', 'findFirst', async (args: any) => {
    assert.deepEqual(args.where, { id: 40, tugas: { user: { managerId: 9 } } });
    return { id: 40, tugasId: 5, status: 'stopped', approvalStatus: 'not_approved' };
  });
  let trackingClaim: any;
  mock('$', '$transaction', async (fn: any) => fn({
    tracking: {
      updateMany: async (args: any) => { trackingClaim = args; return { count: 1 }; },
      findUniqueOrThrow: async () => ({ id: 40, approvalStatus: 'approved' }),
    },
    tugasPpj: { updateMany: async (args: any) => { assert.deepEqual(args.where, { id: 5, status: { in: ['need_approval', 'completed'] } }); return { count: 1 }; } },
  }));
  const res = await call(approveTracking, { params: { id: '40' }, user: { id: 9, role: 'kupt' }, body: { safetyStatus: 'aman' } });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(trackingClaim.where, { id: 40, status: 'stopped', approvalStatus: 'not_approved', tugas: { user: { managerId: 9 } } });
  assert.equal(trackingClaim.data.approvedBy, 9);
});

test('a concurrent second approval gets 409 instead of overwriting the first', async () => {
  mock('tracking', 'findFirst', async () => ({ id: 40, tugasId: 5, status: 'stopped', approvalStatus: 'not_approved' }));
  mock('$', '$transaction', async (fn: any) => fn({
    tracking: { updateMany: async () => ({ count: 0 }), findUniqueOrThrow: noWrites },
    tugasPpj: { updateMany: noWrites },
  }));
  const res = await call(approveTracking, { params: { id: '40' }, user: { id: 1, role: 'admin' }, body: { safetyStatus: 'aman' } });
  assert.equal(res.statusCode, 409);
});

for (const [label, status, tracking] of [
  ['running', 'in_progress', { status: 'started', approvalStatus: 'not_approved' }],
  ['awaiting approval', 'need_approval', { status: 'stopped', approvalStatus: 'not_approved' }],
  ['legacy completed but unapproved', 'completed', { status: 'stopped', approvalStatus: 'not_approved' }],
] as const) {
  test(`deleting a ${label} task is refused`, async () => {
    mock('tugasPpj', 'findFirst', async () => ({ id: 5, status, startPointName: null, endPointName: null, tracking: [tracking] }));
    mock('$', '$transaction', noWrites);
    const res = await call(deleteTugas, { params: { id: '5' }, user: { id: 1, role: 'admin' } });
    assert.equal(res.statusCode, 409);
  });
}

test('deleting a pending task without inspection history deletes only while its status is unchanged', async () => {
  mock('tugasPpj', 'findFirst', async () => ({ id: 5, status: 'pending', jalur: 'Jenar → Wojo', tanggal: new Date('2026-12-01'), assignedTo: 20, tracking: [] }));
  for (const [count, status] of [[1, 200], [0, 409]] as const) {
    const calls: string[] = [];
    mock('$', '$transaction', async (fn: any) => fn({
      tugasPpj: {
        deleteMany: async (args: any) => { calls.push('delete'); assert.deepEqual(args.where, { id: 5, status: 'pending' }); return { count }; },
      },
      tracking: { count: async () => 0 },
      adminAuditLog: { create: async () => { calls.push('audit'); } },
    }));
    const res = await call(deleteTugas, { params: { id: '5' }, user: { id: 1, role: 'admin' } });
    assert.equal(res.statusCode, status);
    // A PPJ start racing the delete changes the status, so nothing is deleted or logged.
    assert.deepEqual(calls, count ? ['delete', 'audit'] : ['delete']);
  }
});

test('releasing a PPJ with unfinished tasks is refused', async () => {
  mock('$', '$transaction', async (fn: any) => fn({
    user: { findFirst: async () => ({ id: 20, managerId: 1 }), updateMany: noWrites },
    tugasPpj: { count: async () => 1 },
  }));
  const res = await call(removePetugasFromManager, { body: { id: 20 }, user: { id: 1, role: 'admin' } });
  assert.equal(res.statusCode, 409);
});

test('adding petugas reports when nobody could be claimed and only claims active unmanaged PPJ', async () => {
  mock('user', 'updateMany', async (args: any) => {
    assert.deepEqual(args.where, { nipp: { in: ['PPJ-1'] }, role: 'ppj', isActive: true, managerId: null });
    return { count: 0 };
  });
  assert.equal((await call(addPetugasToManager, { body: { nipps: [' PPJ-1 '] }, user: { id: 1, role: 'admin' } })).statusCode, 409);
  assert.equal((await call(addPetugasToManager, { body: { nipps: [{}] }, user: { id: 1, role: 'admin' } })).statusCode, 400);
});

test('new accounts store a trimmed NIPP so they can log in', async () => {
  mock('user', 'findUnique', async () => null);
  let created: any;
  mock('$', '$transaction', async (fn: any) => fn({ user: { create: async (args: any) => { created = args.data; return { id: 3 }; } } }));
  const res = await call(createUser, { body: { nipp: '  PPJ-9 ', nama: ' Budi ', password: 'secret1', role: 'ppj' }, user: { id: 1, role: 'admin' } });
  assert.equal(res.statusCode, 201);
  assert.equal(created.nipp, 'PPJ-9');
  assert.equal(created.nama, 'Budi');
});

test('user updates reject non-boolean status and deactivating a PPJ mid-inspection', async () => {
  mock('user', 'findUnique', async () => ({ id: 20, role: 'ppj' }));
  mock('$', '$transaction', noWrites);
  assert.equal((await call(updateUser, { params: { id: '20' }, body: { isActive: 'false' } })).statusCode, 400);
  // The running-task check now happens inside the locked transaction, before any write.
  mock('$', '$transaction', async (fn: any) => fn({ tugasPpj: { count: async () => 1 }, user: { findMany: async () => [], update: noWrites } }));
  assert.equal((await call(updateUser, { params: { id: '20' }, body: { isActive: false } })).statusCode, 409);
});

test('manual assignments use catalog coordinates and reject points outside the list', async () => {
  const base = { jalur: 'Jenar → Wojo', tanggal: '2026-12-01', assignedTo: 20, jamMulai: '08:00', jamSelesai: '16:00' };
  mock('user', 'findFirst', async () => ({ id: 20 }));
  mock('tugasPpj', 'findFirst', async () => null); // no duplicate
  let created: any;
  mock('tugasPpj', 'create', async (args: any) => { created = args.data; return { id: 1 }; });
  const ok = await call(createTugas, { body: { ...base, startPointName: 'Sta. Jenar', endPointName: 'Sta. Wojo', startPointLat: 0, startPointLong: 0, endPointLat: 1, endPointLong: 1 }, user: { id: 1, role: 'admin' } });
  assert.equal(ok.statusCode, 201);
  assert.deepEqual([created.startPointLat, created.startPointLong], [-7.802037, 110.000797]);
  const unknown = await call(createTugas, { body: { ...base, startPointName: 'Sta. Palsu', endPointName: 'Sta. Wojo', startPointLat: 0, startPointLong: 0, endPointLat: 1, endPointLong: 1 }, user: { id: 1, role: 'admin' } });
  assert.equal(unknown.statusCode, 400);
});

test('category reorder rejects unknown or duplicate ids instead of failing with 500', async () => {
  mock('kategoriTemuan', 'count', async () => 1);
  mock('$', '$transaction', noWrites);
  assert.equal((await call(reorderKategoriTemuan, { body: { order: [1, 999] } })).statusCode, 400);
  assert.equal((await call(reorderKategoriTemuan, { body: { order: [1, 1] } })).statusCode, 400);
});


test('a task with an approved inspection is kept as history', async () => {
  mock('tugasPpj', 'findFirst', async () => ({ id: 5, status: 'completed', tracking: [{ status: 'stopped', approvalStatus: 'approved' }] }));
  mock('$', '$transaction', noWrites);
  const res = await call(deleteTugas, { params: { id: '5' }, user: { id: 1, role: 'admin' } });
  assert.equal(res.statusCode, 409);
});

test('deactivating a KUPT whose PPJ still have open tasks is refused', async () => {
  mock('user', 'findUnique', async () => ({ id: 30, role: 'kupt' }));
  mock('$', '$transaction', async (fn: any) => fn({ tugasPpj: { count: async () => 2 }, user: { findMany: async () => [{ id: 20 }], update: noWrites } }));
  assert.equal((await call(updateUser, { params: { id: '30' }, body: { isActive: false } })).statusCode, 409);
});

test('manual assignments need a start time', async () => {
  mock('$', '$transaction', noWrites);
  const res = await call(createTugas, { body: { jalur: 'Jenar → Wojo', tanggal: '2026-12-01', assignedTo: 20, startPointName: 'Sta. Jenar', endPointName: 'Sta. Wojo' }, user: { id: 1, role: 'admin' } });
  assert.equal(res.statusCode, 400);
});

test('a category can be switched off instead of hard-deleted, and only with a real boolean', async () => {
  mock('kategoriTemuan', 'findUnique', async () => ({ id: 3 }));
  let data: any = null;
  mock('kategoriTemuan', 'update', async (args: any) => { data = args.data; return { id: 3, ...args.data }; });
  assert.equal((await call(updateKategoriTemuan, { params: { id: '3' }, body: { isActive: 'false' } })).statusCode, 400);
  assert.equal(data, null);
  assert.equal((await call(updateKategoriTemuan, { params: { id: '3' }, body: { isActive: false } })).statusCode, 200);
  assert.deepEqual(data, { isActive: false });
});
