import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import prisma from '../config/database';
import { checkMissedTasks } from './scheduler';

const original = { findMany: prisma.tugasPpj.findMany, updateMany: prisma.tugasPpj.updateMany };
afterEach(() => Object.assign(prisma.tugasPpj, original));

test('scheduler catches up old dates, skips invalid/unscheduled tasks, and keeps future windows', async () => {
  prisma.tugasPpj.findMany = (async (args: any) => {
    assert.deepEqual(args.where.tanggal, { lte: new Date('2026-10-19T00:00:00Z') });
    return [
      { id: 1, tanggal: new Date('2026-10-18'), jamMulai: '23:30' },
      { id: 2, tanggal: new Date('2026-10-19'), jamMulai: '11:00' },
      { id: 3, tanggal: new Date('2026-10-18'), jamMulai: 'invalid' },
      { id: 4, tanggal: new Date('2026-10-18'), jamMulai: null },
    ];
  }) as any;
  const ids: number[] = [];
  prisma.tugasPpj.updateMany = (async (args: any) => {
    ids.push(args.where.id);
    assert.equal(args.where.status, 'pending');
    return { count: 1 };
  }) as any;
  assert.equal(await checkMissedTasks(new Date('2026-10-19T03:00:00Z')), 1);
  assert.deepEqual(ids, [1]);
});

test('scheduler does not overwrite a task claimed by concurrent start tracking', async () => {
  let status = 'pending';
  prisma.tugasPpj.findMany = (async () => {
    status = 'in_progress';
    return [{ id: 1, tanggal: new Date('2026-10-18'), jamMulai: '08:00' }];
  }) as any;
  prisma.tugasPpj.updateMany = (async (args: any) => {
    if (status !== args.where.status) return { count: 0 };
    status = args.data.status;
    return { count: 1 };
  }) as any;
  assert.equal(await checkMissedTasks(new Date('2026-10-19T03:00:00Z')), 0);
  assert.equal(status, 'in_progress');
});
