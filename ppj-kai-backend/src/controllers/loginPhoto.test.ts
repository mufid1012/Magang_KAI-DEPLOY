import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { Server } from 'node:http';
import express from 'express';
import helmet from 'helmet';
import { createCanvas } from 'canvas';
import prisma from '../config/database';
import { generateToken } from '../utils/jwt';
import adminRoutes, { publicLoginPhotoRoutes } from '../routes/loginPhoto.routes';

// Exercise real HTTP, JWT/role middleware, multipart parsing and image decoding.
// Only persistence is replaced; no existing database records are touched.
const original = {
  findMany: prisma.loginPhoto.findMany, findUnique: prisma.loginPhoto.findUnique,
  create: prisma.loginPhoto.create, update: prisma.loginPhoto.update, delete: prisma.loginPhoto.delete,
  user: prisma.user.findUnique, execute: prisma.$executeRawUnsafe,
};
let rows: any[] = [];
let nextId = 1;
let server: Server;
let base: string;
const png = createCanvas(2, 2).toBuffer('image/png');
const jpg = createCanvas(3, 2).toBuffer('image/jpeg');
const roles = ['admin', 'kupt', 'qc', 'ppj', 'guest'];
const originalSecret = process.env.JWT_SECRET;
const select = (row: any, fields: any) => Object.fromEntries(Object.keys(fields).map(key => [key, row[key]]));

before(async () => {
  process.env.JWT_SECRET = 'login-photo-http-tests-only-secret-123456789';
  prisma.$executeRawUnsafe = (async (sql: string) => { assert.match(sql, /CREATE TABLE IF NOT EXISTS `login_photos`/); return 0; }) as any;
  prisma.user.findUnique = (async ({ where }: any) => where.id <= 5
    ? { id: where.id, role: roles[where.id - 1], isActive: true } : null) as any;
  prisma.loginPhoto.findMany = (async (args: any) => rows.filter(row => !args.where?.isActive || row.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id).map(row => select(row, args.select))) as any;
  prisma.loginPhoto.findUnique = (async (args: any) => {
    const row = rows.find(item => item.id === args.where.id);
    return row ? select(row, args.select) : null;
  }) as any;
  prisma.loginPhoto.create = (async (args: any) => {
    const row = { id: nextId++, ...args.data, updatedAt: new Date() };
    rows.push(row);
    return select(row, args.select);
  }) as any;
  prisma.loginPhoto.update = (async (args: any) => {
    const row = rows.find(item => item.id === args.where.id);
    if (!row) throw { code: 'P2025' };
    Object.assign(row, args.data, { updatedAt: new Date(row.updatedAt.getTime() + 1) });
    return select(row, args.select);
  }) as any;
  prisma.loginPhoto.delete = (async (args: any) => {
    const row = rows.find(item => item.id === args.where.id);
    if (!row) throw { code: 'P2025' };
    rows = rows.filter(item => item !== row);
    return row;
  }) as any;
  const app = express();
  app.use(helmet());
  app.use(express.json());
  app.use('/api/login-photos', publicLoginPhotoRoutes);
  app.use('/api/admin/login-photos', adminRoutes);
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as any).port}/api`;
});

beforeEach(() => { rows = []; nextId = 1; });
after(async () => {
  if (originalSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = originalSecret;
  Object.assign(prisma.loginPhoto, { findMany: original.findMany, findUnique: original.findUnique, create: original.create, update: original.update, delete: original.delete });
  prisma.user.findUnique = original.user;
  prisma.$executeRawUnsafe = original.execute;
  server.closeAllConnections();
  await new Promise<void>(resolve => server.close(() => resolve()));
});

function form(fields: Record<string, string> = {}, bytes: Buffer | null = png, mime = 'image/png', field = 'photo') {
  const data = new FormData();
  Object.entries({ title: 'Kereta KAI', sortOrder: '0', isActive: 'true', ...fields }).forEach(([key, value]) => data.append(key, value));
  if (bytes) data.append(field, new Blob([new Uint8Array(bytes)], { type: mime }), 'test-photo');
  return data;
}
function request(path = '/admin/login-photos', method = 'GET', body?: FormData, userId: number | null = 1) {
  return fetch(`${base}${path}`, { method, body, headers: userId === null ? {} : { Authorization: `Bearer ${generateToken(userId, roles[userId - 1] || 'admin')}` } });
}

test('CRUD persists image replacement, metadata, ordering, active filter and deletion through HTTP', async () => {
  assert.deepEqual((await (await request('/login-photos', 'GET', undefined, null)).json()).data, []);
  const created = await request('/admin/login-photos', 'POST', form({ title: ' Foto pertama ', sortOrder: '2' }));
  assert.equal(created.status, 201);
  const first = (await created.json()).data;
  assert.equal(first.title, 'Foto pertama');
  assert.equal(first.image, undefined);
  assert.match(first.url, /^\/login-photos\/1\/image\?v=\d+$/);
  const second = (await (await request('/admin/login-photos', 'POST', form({ title: 'Foto kedua', sortOrder: '1' }))).json()).data;
  assert.deepEqual((await (await request('/login-photos', 'GET', undefined, null)).json()).data.map((row: any) => row.id), [second.id, first.id]);
  const image = await request(first.url, 'GET', undefined, null);
  assert.equal(image.headers.get('content-type'), 'image/png');
  assert.equal(image.headers.get('cross-origin-resource-policy'), 'cross-origin');
  assert.equal(image.headers.get('cache-control'), 'no-store');
  assert.deepEqual(Buffer.from(await image.arrayBuffer()), png);
  assert.equal((await request(`/admin/login-photos/${first.id}`, 'PATCH', form({ title: 'Nonaktif', isActive: 'false' }, null))).status, 200);
  assert.deepEqual(rows[0].image, png);
  assert.equal((await (await request('/login-photos', 'GET', undefined, null)).json()).data.length, 1);
  assert.equal((await (await request()).json()).data.length, 2);
  const replaced = await request(`/admin/login-photos/${first.id}`, 'PATCH', form({ title: 'Foto JPG' }, jpg, 'image/jpeg'));
  assert.equal(replaced.status, 200);
  assert.notEqual((await replaced.json()).data.url, first.url);
  const newImage = await request(first.url, 'GET', undefined, null);
  assert.equal(newImage.headers.get('content-type'), 'image/jpeg');
  assert.deepEqual(Buffer.from(await newImage.arrayBuffer()), jpg);
  for (const id of [first.id, second.id]) assert.equal((await request(`/admin/login-photos/${id}`, 'DELETE')).status, 200);
  assert.equal((await request(first.url, 'GET', undefined, null)).status, 404);
  assert.deepEqual((await (await request('/login-photos', 'GET', undefined, null)).json()).data, []);
});

test('anonymous users and every non-admin role cannot list or mutate login photos', async () => {
  for (const userId of [null, 2, 3, 4, 5, 6]) {
    const expected = userId === null || userId === 6 ? 401 : 403;
    for (const [path, method] of [['/admin/login-photos', 'GET'], ['/admin/login-photos', 'POST'], ['/admin/login-photos/1', 'PATCH'], ['/admin/login-photos/1', 'DELETE']]) {
      assert.equal((await request(path, method, undefined, userId)).status, expected);
    }
  }
  assert.equal(rows.length, 0);
});

test('JPEG named as PNG is decoded and served using its actual image type', async () => {
  const result = await request('/admin/login-photos', 'POST', form({}, jpg, 'image/png'));
  assert.equal(result.status, 201);
  const photo = (await result.json()).data;
  const image = await request(photo.url, 'GET', undefined, null);
  assert.equal(image.headers.get('content-type'), 'image/jpeg');
  assert.deepEqual(Buffer.from(await image.arrayBuffer()), jpg);
});

test('metadata validation rejects blank/long titles, invalid ordering and invalid boolean', async () => {
  const invalidFields: Record<string, string>[] = [{ title: '   ' }, { title: 'a'.repeat(151) }, { sortOrder: '-1' }, { sortOrder: '1.5' }, { sortOrder: '10000' }, { sortOrder: 'bad' }, { isActive: 'yes' }];
  for (const fields of invalidFields) {
    assert.equal((await request('/admin/login-photos', 'POST', form(fields))).status, 400);
  }
  assert.equal(rows.length, 0);
});

test('uploads reject missing image, unsupported type, disguised file and corrupted PNG', async () => {
  for (const body of [form({}, null), form({}, Buffer.from('<svg/>'), 'image/svg+xml'), form({}, Buffer.from('fake'), 'image/png'), form({}, Buffer.concat([png.subarray(0, 8), Buffer.from('broken')]))]) {
    assert.equal((await request('/admin/login-photos', 'POST', body)).status, 400);
  }
  assert.equal(rows.length, 0);
});

test('multipart rejects oversized files, extra fields and unexpected file input', async () => {
  const oversized = await request('/admin/login-photos', 'POST', form({}, Buffer.alloc(5 * 1024 * 1024 + 1)));
  assert.equal(oversized.status, 400);
  assert.match((await oversized.json()).message, /maksimal 5 MB/);
  assert.equal((await request('/admin/login-photos', 'POST', form({}, png, 'image/png', 'unexpected'))).status, 400);
  assert.equal((await request('/admin/login-photos', 'POST', form({ extra: 'not allowed' }))).status, 400);
});

test('invalid IDs and missing records return 400/404 for image, update and delete', async () => {
  for (const id of ['0', '-1', '1.5', 'abc', '2147483648']) {
    assert.equal((await request(`/login-photos/${id}/image`, 'GET', undefined, null)).status, 400);
    assert.equal((await request(`/admin/login-photos/${id}`, 'PATCH', form({}, null))).status, 400);
    assert.equal((await request(`/admin/login-photos/${id}`, 'DELETE')).status, 400);
  }
  assert.equal((await request('/admin/login-photos/99', 'PATCH', form({}, null))).status, 404);
  assert.equal((await request('/admin/login-photos/99', 'DELETE')).status, 404);
});
