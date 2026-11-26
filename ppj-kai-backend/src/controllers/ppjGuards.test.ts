import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import prisma from '../config/database';
import { checkPhoto } from '../lib/photo';
import { updateProfile } from './auth.controller';
import { createLaporan } from './laporan.controller';
import { getTugasPetugas } from './tugas.controller';

const db = prisma as any;
const saved: [any, string, unknown][] = [];
function mock(target: any, method: string, fn: unknown) { saved.push([target, method, target[method]]); target[method] = fn; }
afterEach(() => { for (const [target, method, fn] of saved.reverse()) target[method] = fn; saved.length = 0; });

const response = () => ({
  statusCode: 200, body: null as any,
  status(code: number) { this.statusCode = code; return this; },
  json(body: any) { this.body = body; return this; },
} as any);
const call = async (handler: any, req: any) => { const res = response(); await handler(req, res); return res; };
const jpeg = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';

test('photos must be bounded image data URLs; empty means no photo', () => {
  assert.deepEqual(checkPhoto(undefined), { ok: true, value: null });
  assert.deepEqual(checkPhoto(''), { ok: true, value: null });
  assert.deepEqual(checkPhoto(jpeg), { ok: true, value: jpeg });
  assert.equal(checkPhoto('data:image/png;base64,iVBORw0KGgo=').ok, true);
  assert.deepEqual(checkPhoto('selfie'), { ok: false, status: 400 });
  assert.deepEqual(checkPhoto('data:text/html;base64,PGgxPg=='), { ok: false, status: 400 });
  assert.deepEqual(checkPhoto('https://example.com/a.jpg'), { ok: false, status: 400 });
  assert.deepEqual(checkPhoto({}), { ok: false, status: 413 });
  assert.deepEqual(checkPhoto(`data:image/jpeg;base64,${'A'.repeat(7_000_000)}`), { ok: false, status: 413 });
});

test('report photos with a non-image payload are rejected before any lookup', async () => {
  mock(db.tracking, 'findFirst', async () => assert.fail('must validate first'));
  const res = await call(createLaporan, { user: { id: 7, role: 'ppj' }, body: { trackingId: 1, jenisTemuan: 'ringan', lat: -7.8, lng: 110.3, fotoUrl: 'javascript:alert(1)' } });
  assert.equal(res.statusCode, 400);
});

test('PPJ task list selects light tracking fields only', async () => {
  mock(db.tugasPpj, 'findMany', async (args: any) => {
    assert.deepEqual(args.where, { assignedTo: 7 });
    const select = args.include.tracking.select;
    for (const heavy of ['fotoAwal', 'fotoSelesai', 'routePath', 'telemetryState']) assert.equal(select[heavy], undefined);
    assert.equal(select.approvalStatus, true);
    return [{ id: 1, status: 'completed', tracking: [{ status: 'stopped', approvalStatus: 'not_approved' }] }];
  });
  const res = await call(getTugasPetugas, { user: { id: 7, role: 'ppj' } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data[0].status, 'need_approval');
});

test('profile self-service cannot rename and validates phone/photo', async () => {
  mock(db.user, 'update', async () => assert.fail('must not write'));
  const req = (body: any) => ({ user: { id: 7, role: 'ppj' }, body });
  assert.equal((await call(updateProfile, req({ nama: 'Nama Lain' }))).statusCode, 403);
  assert.equal((await call(updateProfile, req({ phone: '<script>' }))).statusCode, 400);
  assert.equal((await call(updateProfile, req({ foto: 'selfie' }))).statusCode, 400);
  assert.equal((await call(updateProfile, req({ foto: `data:image/jpeg;base64,${'A'.repeat(70_000)}` }))).statusCode, 400);
});

test('profile accepts a valid phone and alert sound', async () => {
  let written: any;
  mock(db.user, 'update', async (args: any) => { written = args.data; return { id: 7 }; });
  const res = await call(updateProfile, { user: { id: 7, role: 'ppj' }, body: { phone: ' +62 812-3456 ', alertSound: 'beep' } });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(written, { phone: '+62 812-3456', alertSound: 'beep' });
});
