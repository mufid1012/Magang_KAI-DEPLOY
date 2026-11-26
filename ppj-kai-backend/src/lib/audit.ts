import type { Prisma } from '@prisma/client';

type Db = Pick<Prisma.TransactionClient, 'adminAuditLog'>;

/** Write inside the same transaction as the change, so a rolled-back change leaves no log row. */
export function audit(db: Db, actorId: number, action: string, targetType: string, targetId: number, detail?: Prisma.InputJsonValue) {
  return db.adminAuditLog.create({ data: { actorId, action, targetType, targetId, ...(detail === undefined ? {} : { detail }) } });
}
