import cron from 'node-cron';
import { config } from './config.js';
import { runBackupNow } from './jobs.js';

let task = null;

export function startScheduler() {
  if (task) return task;
  task = cron.schedule(config.cronSchedule, async () => {
    try {
      await runBackupNow();
    } catch (err) {
      console.error('[scheduler] daily backup failed:', err.message);
    }
  });
  console.log(`[scheduler] daily backup scheduled: "${config.cronSchedule}"`);
  return task;
}
