import assert from 'node:assert/strict';
import { test } from 'node:test';
import { once } from 'node:events';
import bcrypt from 'bcryptjs';

// Explicit opt-in: this suite never accepts the application/production database URL.
const url = process.env.AUDIT_DATABASE_URL;
if (!url || new URL(url).hostname !== '127.0.0.1' || !new URL(url).pathname.startsWith('/ppj_audit')) {
  throw new Error('AUDIT_DATABASE_URL must point to an isolated local ppj_audit* database');
}
process.env.DATABASE_URL = url;
process.env.JWT_SECRET = 'audit-integration-secret-with-more-than-32-characters';
const { createApp }: typeof import('../src/app') = require('../src/app');
const prisma: typeof import('../src/config/database').default = require('../src/config/database').default;

test('real MySQL: QC summary flags, station scope, and QC notes permissions', async () => {
  const server = createApp().listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('No port');
  const base = `http://127.0.0.1:${address.port}/api`;
  const suffix = Date.now().toString();
  const password = await bcrypt.hash('test-password', 10);
  const admin = await prisma.user.create({ data: { nipp: 'QA' + suffix, nama: 'QC Test Admin', password, role: 'admin' } });
  const ppj = await prisma.user.create({ data: { nipp: 'QP' + suffix, nama: 'QC Test PPJ', password, role: 'ppj', managerId: admin.id } });
  const wilayah = await prisma.wilayah.create({ data: { kode: 'Q' + suffix, nama: 'QC region', stations: JSON.stringify(['Sta. Jenar']) } });
  const qc = await prisma.user.create({ data: { nipp: 'QQ' + suffix, nama: 'QC Test QC', password, role: 'qc', wilayahAssignments: { create: { wilayahId: wilayah.id } } } });
  const otherQc = await prisma.user.create({ data: { nipp: 'QO' + suffix, nama: 'QC Other', password, role: 'qc' } });
  const tokens = new Map<number, string>();
  const request = (path: string, method = 'GET', body?: unknown, user = qc.id) => fetch(base + path, {
    method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), Authorization: 'Bearer ' + tokens.get(user) }, ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const json = async (response: Response, status: number) => { const data = await response.json(); assert.equal(response.status, status, JSON.stringify(data)); return data; };
  const tugasIds: number[] = [];
  try {
    for (const user of [admin, qc, otherQc]) tokens.set(user.id, (await json(await request('/auth/login', 'POST', { nipp: user.nipp, password: 'test-password' }, 0), 200)).token);

    const today = new Date(new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10) + 'T00:00:00Z');
    const point = { startPointName: 'Sta. Jenar', endPointName: 'Sta. Wojo', startPointLat: -7.802037, startPointLong: 110.000797, endPointLat: -7.862278, endPointLong: 110.041092 };
    const end = new Date(Date.now() - 3600_000);
    // 20 menit untuk ~8 km, berhenti di titik awal, dan jeda GPS 10 menit: tiga tanda.
    const quick = await prisma.tugasPpj.create({ data: { ...point, jalur: 'QC quick ' + suffix, tanggal: today, assignedTo: ppj.id, status: 'need_approval' } });
    const start = new Date(end.getTime() - 20 * 60_000);
    const quickTracking = await prisma.tracking.create({ data: { tugasId: quick.id, startTime: start, endTime: end, durasi: 20 * 60, status: 'stopped', endLat: point.startPointLat, endLong: point.startPointLong } });
    await prisma.trackingSample.createMany({ data: [0, 1, 11, 20].map(m => ({
      trackingId: quickTracking.id, sampleId: `s${m}`, capturedAt: new Date(start.getTime() + m * 60_000), latitude: point.startPointLat, longitude: point.startPointLong, accuracy: 5, quality: 'good',
    })) });
    const missed = await prisma.tugasPpj.create({ data: { ...point, jalur: 'QC missed ' + suffix, tanggal: today, assignedTo: ppj.id, status: 'missed' } });
    const outside = await prisma.tugasPpj.create({ data: { ...point, startPointName: 'Sta. Kutoarjo', endPointName: 'Sta. Butuh', jalur: 'QC outside ' + suffix, tanggal: today, assignedTo: ppj.id, status: 'missed' } });
    tugasIds.push(quick.id, missed.id, outside.id);

    const summary = (await json(await request('/admin/qc/summary?days=1'), 200)).data;
    const mine = summary.flagged.filter((f: { tugasId: number }) => tugasIds.includes(f.tugasId));
    assert.equal(mine.length, 1);
    assert.deepEqual(mine[0].flags, ['durasi_singkat', 'gps_hilang', 'jauh_dari_akhir']);
    const row = summary.petugas.find((p: { id: number }) => p.id === ppj.id);
    assert.deepEqual({ total: row.total, terlaksana: row.terlaksana, missed: row.missed, flagged: row.flagged }, { total: 2, terlaksana: 1, missed: 1, flagged: 1 }, 'outside-station task is excluded');
    await json(await request('/admin/qc/summary?days=1', 'GET', undefined, admin.id), 200);

    // Catatan: QC menulis, pengelola membaca, QC lain di luar wilayah tidak melihat tugasnya.
    await json(await request(`/admin/tugas/${quick.id}/qc-notes`, 'POST', { note: '   ' }), 400);
    await json(await request(`/admin/tugas/${quick.id}/qc-notes`, 'POST', { note: 'x'.repeat(501) }), 400);
    await json(await request(`/admin/tugas/${outside.id}/qc-notes`, 'POST', { note: 'di luar wilayah' }), 404);
    await json(await request(`/admin/tugas/${quick.id}/qc-notes`, 'POST', { note: 'catatan' }, otherQc.id), 404);
    await json(await request(`/admin/tugas/${quick.id}/qc-notes`, 'POST', { note: 'dari admin' }, admin.id), 403);
    const note = (await json(await request(`/admin/tugas/${quick.id}/qc-notes`, 'POST', { note: '  Durasi terlalu singkat.  ' }), 201)).data;
    assert.equal(note.note, 'Durasi terlalu singkat.');
    const adminView = (await json(await request(`/admin/tugas/${quick.id}/qc-notes`, 'GET', undefined, admin.id), 200)).data;
    assert.equal(adminView[0].author.nama, qc.nama);
    const again = (await json(await request('/admin/qc/summary?days=1'), 200)).data;
    assert.equal(again.flagged.find((f: { tugasId: number }) => f.tugasId === quick.id).noteCount, 1);
    await json(await request(`/admin/qc-notes/${note.id}`, 'DELETE', undefined, otherQc.id), 404);
    await json(await request(`/admin/qc-notes/${note.id}`, 'DELETE'), 200);
    assert.equal(await prisma.qcNote.count({ where: { tugasId: quick.id } }), 0);
  } finally {
    await prisma.tracking.deleteMany({ where: { tugasId: { in: tugasIds } } });
    await prisma.tugasPpj.deleteMany({ where: { id: { in: tugasIds } } });
    await prisma.userWilayah.deleteMany({ where: { userId: qc.id } });
    await prisma.wilayah.delete({ where: { id: wilayah.id } });
    await prisma.user.deleteMany({ where: { id: { in: [ppj.id, qc.id, otherQc.id, admin.id] } } });
    server.close();
    await prisma.$disconnect();
  }
});
