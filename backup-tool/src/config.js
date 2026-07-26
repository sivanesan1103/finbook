export const config = {
  dbHost: process.env.DB_HOST || 'db',
  dbPort: process.env.DB_PORT || '3306',
  dbName: process.env.DB_NAME || 'finbook',
  dbUser: process.env.DB_USER || 'root',
  dbPassword: process.env.DB_PASSWORD || '',

  backupDir: process.env.BACKUP_DIR || '/backups',

  retentionDays: Number(process.env.RETENTION_DAYS || 7),
  trashRetentionDays: Number(process.env.TRASH_RETENTION_DAYS || 14),

  cronSchedule: process.env.CRON_SCHEDULE || '0 2 * * *',

  authUser: process.env.BACKUP_TOOL_USER || 'admin',
  authPassword: process.env.BACKUP_TOOL_PASS || '',

  port: Number(process.env.PORT || 4100),
};
