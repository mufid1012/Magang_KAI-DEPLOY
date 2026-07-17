import prisma from '../config/database';

/**
 * Scheduler: Auto-mark missed tasks
 *
 * Runs every 5 minutes and checks for tasks where:
 * - status is still 'pending'
 * - tanggal is today
 * - jam_mulai + 1 hour has passed
 *
 * These tasks are updated to status 'missed'.
 */

const INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

async function checkMissedTasks() {
  try {
    const now = new Date();

    // Get today's date in WIB (UTC+7)
    const nowWIB = new Date(now.getTime() + 7 * 60 * 60 * 1000);
    const todayStr = nowWIB.toISOString().split('T')[0]; // "YYYY-MM-DD"

    // Find all pending tasks for today that have jam_mulai set
    const pendingTasks = await prisma.tugasPpj.findMany({
      where: {
        status: 'pending',
        jamMulai: { not: null },
        tanggal: {
          gte: new Date(`${todayStr}T00:00:00.000Z`),
          lt: new Date(`${todayStr}T23:59:59.999Z`),
        },
      },
    });

    let missedCount = 0;

    for (const task of pendingTasks) {
      if (!task.jamMulai) continue;

      const [hours, minutes] = task.jamMulai.split(':').map(Number);
      const taskDate = new Date(task.tanggal);

      // Build scheduled start time in UTC (converting from WIB)
      const scheduledTime = new Date(Date.UTC(
        taskDate.getUTCFullYear(),
        taskDate.getUTCMonth(),
        taskDate.getUTCDate(),
        hours - 7, // WIB to UTC
        minutes
      ));

      // Window end = jam_mulai + 1 hour
      const windowEnd = new Date(scheduledTime.getTime() + 60 * 60 * 1000);

      if (now > windowEnd) {
        await prisma.tugasPpj.update({
          where: { id: task.id },
          data: { status: 'missed' },
        });
        missedCount++;
        console.log(`[Scheduler] Task #${task.id} (${task.jalur}) marked as MISSED — window ended at ${windowEnd.toISOString()}`);
      }
    }

    if (missedCount > 0) {
      console.log(`[Scheduler] ${missedCount} task(s) marked as missed.`);
    }
  } catch (error) {
    console.error('[Scheduler] Error checking missed tasks:', error);
  }
}

export function startMissedTaskScheduler() {
  console.log('[Scheduler] Missed task scheduler started (interval: 5 min)');

  // Run immediately on startup
  checkMissedTasks();

  // Then run every 5 minutes
  const intervalId = setInterval(checkMissedTasks, INTERVAL_MS);

  return intervalId;
}
