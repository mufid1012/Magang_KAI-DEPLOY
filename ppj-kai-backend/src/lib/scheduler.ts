import prisma from '../config/database';
import { scheduledStart } from '../utils/schedule';

const INTERVAL_MS = 5 * 60 * 1000;
let running = false;

/** Catch up after downtime; conditional writes cannot overwrite a started task. */
export async function checkMissedTasks(now = new Date()): Promise<number> {
  if (running) return 0;
  running = true;
  try {
    const today = new Date(now.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const pendingTasks = await prisma.tugasPpj.findMany({
      where: { status: 'pending', jamMulai: { not: null }, tanggal: { lte: new Date(`${today}T00:00:00Z`) } },
      select: { id: true, tanggal: true, jamMulai: true },
    });
    let count = 0;
    for (const task of pendingTasks) {
      const start = scheduledStart(task.tanggal, task.jamMulai);
      if (!start || now.getTime() <= start.getTime() + 60 * 60 * 1000) continue;
      const result = await prisma.tugasPpj.updateMany({
        where: { id: task.id, status: 'pending' }, data: { status: 'missed' },
      });
      count += result.count;
    }
    if (count) console.log(`[Scheduler] ${count} task(s) marked as missed.`);
    return count;
  } catch (error) {
    console.error('[Scheduler] Error checking missed tasks:', error);
    return 0;
  } finally { running = false; }
}

export function startMissedTaskScheduler() {
  void checkMissedTasks();
  return setInterval(() => { void checkMissedTasks(); }, INTERVAL_MS);
}
