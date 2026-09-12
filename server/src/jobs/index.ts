import {
  startOverdueTasksJob,
  stopOverdueTasksJob,
  processOverdueTasks,
  isOverdueTasksJobRunning,
  OverdueProcessResult,
} from './overdueTasks.job';

/**
 * Initializes and starts all scheduled background jobs.
 */
export function startBackgroundJobs(): void {
  console.log('[BackgroundJobs] Initializing background jobs...');
  startOverdueTasksJob();
}

/**
 * Gracefully stops all active scheduled background jobs.
 */
export function stopBackgroundJobs(): void {
  console.log('[BackgroundJobs] Stopping background jobs...');
  stopOverdueTasksJob();
}

export {
  startOverdueTasksJob,
  stopOverdueTasksJob,
  processOverdueTasks,
  isOverdueTasksJobRunning,
  OverdueProcessResult,
};
