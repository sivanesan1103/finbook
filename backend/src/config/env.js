import dotenv from 'dotenv';
dotenv.config();

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 4000),
  databaseUrl: process.env.DATABASE_URL,
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET || 'dev-access-secret',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret',
    accessExpires: process.env.JWT_ACCESS_EXPIRES || '15m',
    refreshExpires: process.env.JWT_REFRESH_EXPIRES || '30d',
  },
  upload: {
    dir: process.env.UPLOAD_DIR || 'uploads',
    maxMb: Number(process.env.MAX_UPLOAD_MB || 5),
  },
  corsOrigins: (process.env.CORS_ORIGINS || '*').split(',').map((s) => s.trim()),
  discordWebhookUrl: process.env.DISCORD_WEBHOOK_URL || '',
  // Base URL of the deployed web app — used to build public share links
  // (e.g. https://finbook.sivaprj.online/t/<token>) that go out over
  // WhatsApp/SMS, so it has to be the real internet-facing origin, not the
  // API's own host.
  publicWebUrl: process.env.PUBLIC_WEB_URL || 'https://finbook.sivaprj.online',
};

export default env;
