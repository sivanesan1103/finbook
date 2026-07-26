import env from './env.js';

const COLORS = {
  error: 0xe74c3c, // red
  dbError: 0x992d22, // dark red — visually distinct from a plain server error
  warning: 0xf39c12, // orange
  success: 0x2ecc71, // green
};

/** e.g. "Jul 26, 11:45 PM" — explicit 12-hour format rather than Discord's own
 * viewer-local timestamp rendering, since the ask was specifically for 12hr. */
const fmtTime = (d = new Date()) =>
  d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });

let lastSentAt = 0;

/** Posts one rich embed to the configured Discord webhook. No-ops silently
 * if DISCORD_WEBHOOK_URL isn't set, and throttles to stay well under
 * Discord's own per-webhook rate limit (30 requests/min) during an error loop. */
function notifyDiscord({ emoji, title, description, color, fields = [] }) {
  if (!env.discordWebhookUrl) return;

  const now = Date.now();
  if (now - lastSentAt < 2000) return;
  lastSentAt = now;

  const payload = {
    username: 'FinBook Server',
    embeds: [
      {
        title: `${emoji} ${title}`,
        description,
        color,
        fields: [...fields.filter(Boolean), { name: '🌐 Environment', value: env.nodeEnv, inline: true }],
        footer: { text: `🕐 ${fmtTime()}` },
      },
    ],
  };

  fetch(env.discordWebhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => {
    // Nothing more useful to do if Discord itself is unreachable.
  });
}

const codeBlock = (s) => `\`\`\`${String(s).slice(0, 1500)}\`\`\``;

export const notifyServerError = (message, { path, method, status, ip, userId, stack } = {}) =>
  notifyDiscord({
    emoji: '🔴',
    title: 'Backend Server Error',
    description: codeBlock(message),
    color: COLORS.error,
    fields: [
      method && path && { name: '📍 Route', value: `${method} ${path}`, inline: true },
      status && { name: '🚦 Status', value: String(status), inline: true },
      ip && { name: '📡 IP', value: ip, inline: true },
      userId && { name: '👤 User', value: userId, inline: true },
      stack && { name: '🧵 Stack (top)', value: codeBlock(String(stack).split('\n').slice(0, 4).join('\n')) },
    ],
  });

export const notifyDbError = (message, { code } = {}) =>
  notifyDiscord({
    emoji: '💥',
    title: 'Database Error',
    description: codeBlock(message),
    color: COLORS.dbError,
    fields: [code && { name: '🏷️ Code', value: code, inline: true }],
  });

export const notifyClientCrash = ({ platform, message, device, appVersion, userId, stack }) =>
  notifyDiscord({
    emoji: platform === 'mobile' ? '📱' : '🌐',
    title: `${platform === 'mobile' ? 'Mobile' : 'Web'} App Crash`,
    description: codeBlock(message),
    color: COLORS.error,
    fields: [
      device && { name: '📟 Device', value: device, inline: true },
      appVersion && { name: '🔖 Version', value: appVersion, inline: true },
      userId && { name: '👤 User', value: userId, inline: true },
      stack && { name: '🧵 Stack (top)', value: codeBlock(String(stack).split('\n').slice(0, 4).join('\n')) },
    ],
  });

export const notifyLoginFailed = (email, ip, userAgent) =>
  notifyDiscord({
    emoji: '🔑',
    title: 'Failed Login Attempt',
    description: `🙍 **${email || 'unknown'}**`,
    color: COLORS.warning,
    fields: [
      ip && { name: '📡 IP', value: ip, inline: true },
      userAgent && { name: '🖥️ Device/Browser', value: userAgent.slice(0, 200), inline: false },
    ],
  });

export const notifyServerStarted = (port, nodeEnv) =>
  notifyDiscord({
    emoji: '🚀',
    title: 'FinBook API Started',
    description: `✅ Listening on port **${port}**`,
    color: COLORS.success,
    fields: [
      { name: '🟢 Node', value: process.version, inline: true },
      { name: '🆔 PID', value: String(process.pid), inline: true },
      { name: '⚙️ Mode', value: nodeEnv, inline: true },
    ],
  });

export const notifyServerStopped = (signal) =>
  notifyDiscord({
    emoji: '🛑',
    title: 'FinBook API Shutting Down',
    description: `⚠️ Received **${signal}**`,
    color: COLORS.warning,
    fields: [
      { name: '⏱️ Uptime', value: `${Math.floor(process.uptime())}s`, inline: true },
    ],
  });

