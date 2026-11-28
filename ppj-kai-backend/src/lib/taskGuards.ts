import type { Prisma } from '@prisma/client';
import { schedulesOverlap } from '../utils/assignmentValidation';

type Db = Pick<Prisma.TransactionClient, 'tugasPpj'>;

/**
 * Tasks that still need their PPJ's current manager: a scheduled one (the PPJ can still
 * start it), a running inspection, or one awaiting approval (including legacy 'completed'
 * rows whose tracking is unapproved). Task scope follows the PPJ's managerId, so releasing
 * such a PPJ leaves nobody to approve or force-stop these tasks.
 */
export function unfinishedTaskWhere(petugasIds: number[]): Prisma.TugasPpjWhereInput {
  return {
    assignedTo: { in: petugasIds },
    OR: [
      { status: { in: ['pending', 'in_progress', 'need_approval'] } },
      { tracking: { some: { status: 'started' } } },
      { status: 'completed', tracking: { some: { status: 'stopped', approvalStatus: 'not_approved' } } },
    ],
  };
}

/** The same assignment already exists (double click, re-uploaded Excel). Shared by manual and import. */
export function findDuplicateAssignment(db: Db, task: { assignedTo: number; tanggal: Date; startPointName: string; endPointName: string; jamMulai: string | null }) {
  return db.tugasPpj.findFirst({
    // The app no longer stores 'cancelled' (deleting removes the row); older databases may still hold such rows.
    where: { ...task, status: { not: 'cancelled' } },
    select: { id: true },
  });
}

/** Serializes assignment writes per PPJ: concurrent imports or clicks wait here instead of both inserting. */
export async function lockPetugas(tx: Prisma.TransactionClient, petugasId: number): Promise<void> {
  await tx.$queryRaw`SELECT id FROM users WHERE id = ${petugasId} FOR UPDATE`;
}

/**
 * Another task of this PPJ on the same day whose hours intersect. Missed and rejected tasks no
 * longer occupy the slot: a re-inspection after a rejection is a new task, often at the same hours.
 */
export async function findOverlappingAssignment(db: Db, task: { assignedTo: number; tanggal: Date; jamMulai: string; jamSelesai: string | null }) {
  const sameDay = await db.tugasPpj.findMany({
    where: { assignedTo: task.assignedTo, tanggal: task.tanggal, status: { notIn: ['cancelled', 'missed', 'rejected'] } },
    select: { id: true, jalur: true, jamMulai: true, jamSelesai: true },
  });
  return sameDay.find(other => schedulesOverlap(task, other)) ?? null;
}

export function scheduleConflictMessage(clash: { jalur: string; jamMulai: string | null; jamSelesai: string | null }): string {
  const hours = clash.jamMulai ? `${clash.jamMulai}–${clash.jamSelesai ?? 'selesai hari'}` : 'sepanjang hari';
  return `Jadwal bentrok dengan tugas "${clash.jalur}" pukul ${hours}`;
}

export async function countUnfinishedTasks(db: Db, petugasIds: number[]): Promise<number> {
  if (petugasIds.length === 0) return 0;
  return db.tugasPpj.count({ where: unfinishedTaskWhere(petugasIds) });
}

export async function countRunningTasks(db: Db, petugasId: number): Promise<number> {
  return db.tugasPpj.count({
    where: { assignedTo: petugasId, OR: [{ status: 'in_progress' }, { tracking: { some: { status: 'started' } } }] },
  });
}
