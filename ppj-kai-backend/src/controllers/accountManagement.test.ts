import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import prisma from '../config/database';
import { createUser, updateUser } from './admin.controller';

const originalFindUnique = prisma.user.findUnique;
const originalUserCount = prisma.user.count;
const originalWilayahCount = prisma.wilayah.count;
const originalTransaction = prisma.$transaction;
const originalFindMany = prisma.user.findMany;

afterEach(() => {
  prisma.user.findUnique = originalFindUnique;
  prisma.user.count = originalUserCount;
  prisma.wilayah.count = originalWilayahCount;
  prisma.$transaction = originalTransaction;
  prisma.user.findMany = originalFindMany;
});

const response = () => ({
  statusCode: 200,
  body: null as any,
  status(code: number) { this.statusCode = code; return this; },
  json(body: any) { this.body = body; return this; },
} as any);

test('KUPT update requires at least two distinct wilayah', async () => {
  prisma.user.findUnique = (async () => ({ id: 12, role: 'kupt' })) as any;
  prisma.$transaction = (async () => assert.fail('must not write invalid assignments')) as any;

  for (const wilayahIds of [[], [1], [1, 1]]) {
    const res = response();
    await updateUser({ params: { id: '12' }, body: { nama: 'KUPT A', role: 'kupt', wilayahIds, petugasIds: [] } } as any, res);
    assert.equal(res.statusCode, 400);
    assert.match(res.body.message, /minimal 2 wilayah|Daftar wilayah tidak valid/);
  }
});

test('KUPT update atomically replaces wilayah and managed petugas', async () => {
  let findCount = 0;
  prisma.user.findUnique = (async () => {
    findCount += 1;
    return findCount === 1
      ? { id: 12, role: 'kupt' }
      : { id: 12, nipp: 'KUPT-12', nama: 'KUPT A', role: 'kupt', isActive: true, wilayahAssignments: [] };
  }) as any;
  prisma.wilayah.count = (async () => 2) as any;
  prisma.user.count = (async () => 2) as any;
  prisma.user.findMany = (async () => [{ id: 20 }]) as any; // already managed and kept

  const calls: { model: string; method: string; args: any }[] = [];
  const tx = {
    $queryRaw: async () => [],
    adminAuditLog: { create: async () => ({}) },
    tugasPpj: { count: async () => 0 },
    user: {
      findMany: async () => [{ id: 20 }], // already managed and kept
      update: async (args: any) => { calls.push({ model: 'user', method: 'update', args }); },
      updateMany: async (args: any) => { calls.push({ model: 'user', method: 'updateMany', args }); },
    },
    userWilayah: {
      deleteMany: async (args: any) => { calls.push({ model: 'userWilayah', method: 'deleteMany', args }); },
      createMany: async (args: any) => { calls.push({ model: 'userWilayah', method: 'createMany', args }); },
    },
  };
  prisma.$transaction = (async (fn: any) => fn(tx)) as any;

  const res = response();
  await updateUser({
    params: { id: '12' },
    user: { id: 1, role: 'admin' },
    body: { nama: 'KUPT A', role: 'kupt', wilayahIds: [2, 3], petugasIds: [20, 21] },
  } as any, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(calls.find(call => call.model === 'userWilayah' && call.method === 'createMany')?.args.data, [
    { userId: 12, wilayahId: 2 },
    { userId: 12, wilayahId: 3 },
  ]);
  const managerWrites = calls.filter(call => call.model === 'user' && call.method === 'updateMany');
  assert.deepEqual(managerWrites[0]?.args, { where: { role: 'ppj', managerId: 12 }, data: { managerId: null } });
  assert.deepEqual(managerWrites[1]?.args, { where: { id: { in: [20, 21] }, role: 'ppj' }, data: { managerId: 12 } });
});

// PPJ selected for a KUPT may belong to another manager; that manager's open tasks must not change approver.
function takeoverTx(writes: string[]) {
  return {
    $queryRaw: async () => [],
    adminAuditLog: { create: async () => ({}) },
    tugasPpj: { count: async (args: any) => (args.where.assignedTo.in.includes(21) ? 1 : 0) },
    user: {
      findMany: async (args: any) => (args.where.NOT ? [{ id: 21 }] : []), // 21 is managed by someone else
      create: async () => { writes.push('create'); return { id: 30 }; },
      update: async () => { writes.push('update'); },
      updateMany: async () => { writes.push('updateMany'); },
    },
    userWilayah: { deleteMany: async () => {}, createMany: async () => {} },
  };
}

test('KUPT update refuses to take over a PPJ whose current manager still has open tasks', async () => {
  prisma.user.findUnique = (async () => ({ id: 12, role: 'kupt', managerId: null })) as any;
  prisma.user.count = (async () => 1) as any;
  const writes: string[] = [];
  prisma.$transaction = (async (fn: any) => fn(takeoverTx(writes))) as any;
  const res = response();
  await updateUser({ params: { id: '12' }, user: { id: 1, role: 'admin' }, body: { petugasIds: [21] } } as any, res);
  assert.equal(res.statusCode, 409);
  assert.deepEqual(writes, []);
});

test('KUPT creation refuses to take over a PPJ whose current manager still has open tasks', async () => {
  prisma.user.findUnique = (async () => null) as any;
  prisma.user.count = (async () => 1) as any;
  prisma.wilayah.count = (async () => 2) as any;
  const writes: string[] = [];
  prisma.$transaction = (async (fn: any) => fn(takeoverTx(writes))) as any;
  const res = response();
  await createUser({ user: { id: 1, role: 'admin' }, body: { nipp: 'KUPT-9', nama: 'KUPT B', password: 'rahasia1', role: 'kupt', wilayahIds: [1, 2], petugasIds: [21] } } as any, res);
  assert.equal(res.statusCode, 409);
  assert.deepEqual(writes, []);
});
