import cron, { ScheduledTask } from 'node-cron';
import { TaskStatus } from '@prisma/client';
import prisma from '../lib/prisma';
import { env } from '../config/env';

export interface OverdueProcessResult {
  markedCount: number;
  clearedCount: number;
  processedAt: Date;
}

let activeCronTask: ScheduledTask | null = null;

/**
 * Evaluates tasks in PostgreSQL and persists overdue state directly in the database.
 * - Tasks where dueDate < now and status != DONE are marked isOverdue = true.
 * - Tasks where status = DONE, or dueDate >= now, or dueDate = null are reset to isOverdue = false.
 *
 * @param referenceTime Optional reference timestamp (defaults to current server time).
 */
export async function processOverdueTasks(referenceTime?: Date): Promise<OverdueProcessResult> {
  const now = referenceTime || new Date();

  // 1. Mark tasks overdue where dueDate has passed and status is not DONE
  const markedResult = await prisma.task.updateMany({
    where: {
      dueDate: { lt: now },
      status: { not: TaskStatus.DONE },
      isOverdue: false,
    },
    data: {
      isOverdue: true,
    },
  });

  // 2. Clear overdue state for tasks that are completed (DONE), extended to the future, or have no due date
  const clearedResult = await prisma.task.updateMany({
    where: {
      isOverdue: true,
      OR: [
        { status: TaskStatus.DONE },
        { dueDate: { gte: now } },
        { dueDate: null },
      ],
    },
    data: {
      isOverdue: false,
    },
  });

  if (markedResult.count > 0 || clearedResult.count > 0) {
    console.log(
      `[OverdueJob] Overdue processing completed: ${markedResult.count} marked overdue, ${clearedResult.count} cleared.`
    );
  }

  return {
    markedCount: markedResult.count,
    clearedCount: clearedResult.count,
    processedAt: now,
  };
}

/**
 * Starts the scheduled background job using node-cron.
 * Guards against duplicate schedulers.
 *
 * @param customSchedule Optional cron schedule string (defaults to env.OVERDUE_TASK_CRON or '* * * * *').
 */
export function startOverdueTasksJob(customSchedule?: string): ScheduledTask {
  if (activeCronTask) {
    return activeCronTask;
  }

  const scheduleExpression = customSchedule || env.OVERDUE_TASK_CRON || '* * * * *';

  if (!cron.validate(scheduleExpression)) {
    console.warn(
      `[OverdueJob] Invalid cron expression '${scheduleExpression}', falling back to '* * * * *'`
    );
  }

  const validSchedule = cron.validate(scheduleExpression) ? scheduleExpression : '* * * * *';

  activeCronTask = cron.schedule(validSchedule, async () => {
    try {
      await processOverdueTasks();
    } catch (error) {
      console.error('[OverdueJob] Error during scheduled overdue task execution:', error);
    }
  });

  console.log(`[OverdueJob] Background scheduler started with schedule: '${validSchedule}'`);
  return activeCronTask;
}

/**
 * Stops the scheduled background job and resets the singleton instance.
 */
export function stopOverdueTasksJob(): void {
  if (activeCronTask) {
    activeCronTask.stop();
    activeCronTask = null;
    console.log('[OverdueJob] Background scheduler stopped.');
  }
}

/**
 * Returns whether the overdue background job is currently scheduled.
 */
export function isOverdueTasksJobRunning(): boolean {
  return activeCronTask !== null;
}
