import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import prisma from '../config/database';
import { deleteUser } from './admin.controller';

const originalTransaction = prisma.$transaction;
afterEach(() => { prisma.$transaction = originalTransaction; });
const request = (id = '12', role = 'admin') => ({ params: { id }, user: { id: 1, role }, body: { confirmPermanent: true } } as any);
const response = () => ({ statusCode: 200, body: null as any, status(code: number) { this.statusCode = code; return this; }, json(body: any) { this.body = body; return this; } } as any);

function database(user: any = { id: 12, role: 'ppj' }, active = false) {
  const calls: { model: string; method: string; args: any }[] = [];
  const tx: any = {};
  for (const model of ['user', 'tugasPpj', 'tracking', 'laporan', 'warningAlert', 'templateItem', 'templatePenugasan', 'userWilayah', 'mapLocation', 'trainSchedule']) {
    tx[model] = {};
    for (const method of ['delete', 'deleteMany', 'updateMany']) {
      tx[model][method] = async (args: any) => { calls.push({ model, method, args }); return { count: 1 }; };
    }
  }
  tx.user.findUnique = async () => user;
  tx.tugasPpj.findFirst = async () => active ? { id: 51 } : null;
  tx.tracking.findMany = async () => [{ id: 71 }];
  prisma.$transaction = (async (fn: any, options: any) => {
    assert.equal(options.isolationLevel, 'Serializable');
    return fn(tx);
  }) as any;
  return { tx, calls };
}

test('deletes the account and its dependencies, releasing managed users without deleting them', async () => {
  const { calls } = database();
  const res = response();
  await deleteUser(request(), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.deepEqual(calls.at(-1), { model: 'user', method: 'delete', args: { where: { id: 12 } } });
  assert.deepEqual(calls.find(c => c.model === 'user' && c.method === 'updateMany')?.args, { where: { managerId: 12 }, data: { managerId: null } });
  assert.deepEqual(calls.find(c => c.model === 'laporan')?.args, { where: { trackingId: { in: [71] } } });
  assert.ok(calls.findIndex(c => c.model === 'laporan') < calls.findIndex(c => c.model === 'tracking' && c.method === 'deleteMany'));
  assert.ok(calls.find(c => c.model === 'templateItem'));
  assert.equal(calls.filter(c => c.model === 'warningAlert' && c.method === 'updateMany').length, 0);
});

for (const [label, user, active, status] of [
  ['missing account', null, false, 404],
  ['admin account', { id: 12, role: 'admin' }, false, 403],
  ['own account', { id: 1, role: 'ppj' }, false, 403],
  ['active inspection', { id: 12, role: 'ppj' }, true, 409],
] as const) {
  test(`rejects ${label} without writing data`, async () => {
    const { calls } = database(user, active);
    const res = response();
    await deleteUser(request(user?.id === 1 ? '1' : '12'), res);
    assert.equal(res.statusCode, status);
    assert.equal(calls.length, 0);
  });
}

test('rejects unauthorized callers and malformed IDs before opening a transaction', async () => {
  prisma.$transaction = (async () => assert.fail('must not access database')) as any;
  for (const [id, role, status] of [['12', 'kupt', 403], ['12x', 'admin', 400], ['0', 'admin', 400]]) {
    const res = response();
    await deleteUser(request(id as string, role as string), res);
    assert.equal(res.statusCode, status);
  }
});

test('legacy deactivate requests cannot trigger permanent deletion', async () => {
  prisma.$transaction = (async () => assert.fail('must not access database')) as any;
  const req = request();
  delete req.body;
  const res = response();
  await deleteUser(req, res);
  assert.equal(res.statusCode, 400);
});

test('failed dependent deletion aborts before account deletion and reports failure', async () => {
  const { tx, calls } = database();
  tx.laporan.deleteMany = async () => { throw { code: 'P2034' }; };
  const res = response();
  await deleteUser(request(), res);
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.success, false);
  assert.equal(calls.some(c => c.model === 'user' && c.method === 'delete'), false);
});
