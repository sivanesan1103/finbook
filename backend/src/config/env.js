import dotenv from 'dotenv';
dotenv.config();

// Dev-only fallbacks. These are deliberately obvious placeholders so the
// production boot guard below can detect and refuse them — a real secret is
// required in production and must never be one of these.
const DEV_ACCESS_SECRET = 'dev-access-secret';
const DEV_REFRESH_SECRET = 'dev-refresh-secret';

// Secrets that, if seen in production, mean someone shipped a placeholder.
// Includes the old docker-compose defaults that used to ship in this repo,
// so a stale production compose can't silently keep using a public value.
const KNOWN_PLACEHOLDERS = new Set([
  DEV_ACCESS_SECRET,
  DEV_REFRESH_SECRET,
  'change-me-access-secret',
  'change-me-refresh-secret',
  '',
]);

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 4000),
  databaseUrl: process.env.DATABASE_URL,
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET || DEV_ACCESS_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET || DEV_REFRESH_SECRET,
    accessExpires: process.env.JWT_ACCESS_EXPIRES || '15m',
    refreshExpires: process.env.JWT_REFRESH_EXPIRES || '30d',
  },
  // Dedicated secrets so these can be rotated independently of the login
  // JWT. They fall back to the JWT access secret only in development, purely
  // so a local dev without them set still works; production requires real
  // values via the same boot guard.
  shareTokenSecret: process.env.SHARE_TOKEN_SECRET
    || process.env.JWT_ACCESS_SECRET || DEV_ACCESS_SECRET,
  fileUrlSecret: process.env.FILE_URL_SECRET
    || process.env.JWT_ACCESS_SECRET || DEV_ACCESS_SECRET,
  // How long a signed /uploads URL stays valid. Long enough that an open
  // detail view keeps working, short enough that a leaked URL (referrer,
  // forwarded chat, proxy log) stops resolving.
  fileUrlTtlSec: Number(process.env.FILE_URL_TTL_SEC || 6 * 60 * 60),
  // How long a public "view this entry" share link stays valid. 0 = never
  // expires (previous behaviour); set a value to expire links.
  shareTokenTtlSec: Number(process.env.SHARE_TOKEN_TTL_SEC || 30 * 24 * 60 * 60),
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

// ── Production secret guard ──────────────────────────────────────────────
// A JWT signed with a known placeholder secret can be forged by anyone who
// has read this (public) repo, granting full account access. Rather than
// trusting every deployment to override the defaults, refuse to boot in
// production if any auth secret is missing or a placeholder. Fail loud at
// startup, never silently run forgeable.
if (env.nodeEnv === 'production') {
  const problems = [];
  if (KNOWN_PLACEHOLDERS.has(env.jwt.accessSecret)) problems.push('JWT_ACCESS_SECRET');
  if (KNOWN_PLACEHOLDERS.has(env.jwt.refreshSecret)) problems.push('JWT_REFRESH_SECRET');
  if (KNOWN_PLACEHOLDERS.has(env.shareTokenSecret)) problems.push('SHARE_TOKEN_SECRET');
  if (KNOWN_PLACEHOLDERS.has(env.fileUrlSecret)) problems.push('FILE_URL_SECRET');
  if (problems.length) {
    throw new Error(
      `Refusing to start: these secrets are missing or set to a known placeholder `
      + `in production: ${problems.join(', ')}. Set strong random values `
      + `(e.g. \`openssl rand -base64 48\`) in the environment.`,
    );
  }
}

export default env;
