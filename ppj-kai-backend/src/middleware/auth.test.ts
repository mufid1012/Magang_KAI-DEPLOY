import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import prisma from '../config/database';
import { generateToken } from '../utils/jwt';
import { requireAuth } from './auth.middleware';

process.env.JWT_SECRET = 'unit-test-jwt-secret-with-32-characters-minimum';

const original = prisma.user.findUnique;
afterEach(() => { prisma.user.findUnique = original; });

for (const user of [null, { id: 12, role: 'ppj', isActive: false }]) {
  test(`rejects existing JWT for ${user ? 'inactive' : 'deleted'} account`, async () => {
    prisma.user.findUnique = (async () => user) as any;
    const req = { headers: { authorization: `Bearer ${generateToken(12, 'ppj')}` } } as any;
    const res = { statusCode: 200, status(code: number) { this.statusCode = code; return this; }, json() { return this; } } as any;
    await requireAuth(req, res, () => assert.fail('must not authorize'));
    assert.equal(res.statusCode, 401);
  });
}

test('authorizes active account with current database role', async () => {
  prisma.user.findUnique = (async () => ({ id: 12, role: 'ppj', isActive: true })) as any;
  const req = { headers: { authorization: `Bearer ${generateToken(12, 'kupt')}` } } as any;
  let authorized = false;
  await requireAuth(req, {} as any, () => { authorized = true; });
  assert.equal(authorized, true);
  assert.deepEqual(req.user, { id: 12, role: 'ppj' });
});
