import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import prisma from '../config/database';
import { login } from './auth.controller';
import { createLaporan } from './laporan.controller';
import { getActiveTracking, startTracking } from './tracking.controller';

process.env.JWT_SECRET = 'unit-test-jwt-secret-with-32-characters-minimum';

const originals = {
  userFindUnique: prisma.user.findUnique,
  trackingFindFirst: prisma.tracking.findFirst,
  laporanCreate: prisma.laporan.create,
  tugasFindFirst: prisma.tugasPpj.findFirst,
  transaction: prisma.$transaction,
  bypass: process.env.TRACKING_BYPASS_ENABLED,
};

afterEach(() => {
  prisma.user.findUnique = originals.userFindUnique;
  prisma.tracking.findFirst = originals.trackingFindFirst;
  prisma.laporan.create = originals.laporanCreate;
  prisma.tugasPpj.findFirst = originals.tugasFindFirst;
  prisma.$transaction = originals.transaction;
  if (originals.bypass === undefined) delete process.env.TRACKING_BYPASS_ENABLED;
  else process.env.TRACKING_BYPASS_ENABLED = originals.bypass;
});

function response() {
  return {
    statusCode: 200,
    body: null as any,
    status(code: number) { this.statusCode = code; return this; },
    json(body: any) { this.body = body; return this; },
  } as any;
}

test('login does not issue a token for an inactive account', async () => {
  prisma.user.findUnique = (async () => ({
    id: 7, nipp: 'PPJ-7', nama: 'PPJ', password: 'unused', role: 'ppj', isActive: false,
  })) as any;
  const res = response();
  await login({ body: { nipp: 'PPJ-7', password: 'secret' } } as any, res);
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.token, undefined);
});

test('laporan creation requires an owned active tracking session', async () => {
  prisma.tracking.findFirst = (async (args: any) => {
    assert.deepEqual(args.where, {
      id: 91,
      status: 'started',
      tugas: { assignedTo: 7, status: 'in_progress' },
    });
    return null;
  }) as any;
  prisma.laporan.create = (async () => assert.fail('must not create a report for another PPJ')) as any;

  const res = response();
  await createLaporan({
    user: { id: 7, role: 'ppj' },
    body: { trackingId: 91, jenisTemuan: 'ringan', deskripsi: '', lat: -7.8, lng: 110.3 },
  } as any, res);
  assert.equal(res.statusCode, 404);
});

test('active tracking lookup is scoped to the logged-in PPJ', async () => {
  prisma.tracking.findFirst = (async (args: any) => {
    assert.deepEqual(args.where, {
      tugasId: 12,
      status: 'started',
      tugas: { assignedTo: 7, status: 'in_progress' },
    });
    return null;
  }) as any;
  const res = response();
  await getActiveTracking({ params: { tugasId: '12' }, user: { id: 7, role: 'ppj' } } as any, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.trackingId, null);
});

test('tracking bypass stays disabled when the environment flag is absent', async () => {
  delete process.env.TRACKING_BYPASS_ENABLED;
  prisma.tugasPpj.findFirst = (async (args: any) => {
    assert.deepEqual(args.where, { id: 12, assignedTo: 7 });
    return { id: 12, assignedTo: 7, status: 'missed', jamMulai: null };
  }) as any;
  prisma.$transaction = (async () => assert.fail('must not start a missed task')) as any;

  const res = response();
  await startTracking({
    params: { tugasId: '12' },
    user: { id: 7, role: 'ppj' },
    body: { lat: -7.8, lng: 110.3, bypassMode: true },
  } as any, res);
  assert.equal(res.statusCode, 400);
});
