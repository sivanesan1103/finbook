import env from './env.js';

const COLORS = {
  error: 0xe74c3c, // red
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
        fields,
        footer: { text: fmtTime() },
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

export const notifyServerError = (message, { path, ip } = {}) =>
  notifyDiscord({
    emoji: '🔴',
    title: 'Backend Server Error',
    description: codeBlock(message),
    color: COLORS.error,
    fields: [
      path && { name: 'Path', value: path, inline: true },
      ip && { name: 'IP', value: ip, inline: true },
    ].filter(Boolean),
  });

export const notifyDbError = (message) =>
  notifyDiscord({
    emoji: '💥',
    title: 'Database Error',
    description: codeBlock(message),
    color: COLORS.error,
  });

export const notifyClientCrash = ({ platform, message, device }) =>
  notifyDiscord({
    emoji: platform === 'mobile' ? '📱' : '🌐',
    title: `${platform === 'mobile' ? 'Mobile' : 'Web'} App Crash`,
    description: codeBlock(message),
    color: COLORS.error,
    fields: [device && { name: 'Device', value: device, inline: true }].filter(Boolean),
  });

export const notifyLoginFailed = (email, ip) =>
  notifyDiscord({
    emoji: '🔑',
    title: 'Failed Login Attempt',
    description: `**${email}**`,
    color: COLORS.warning,
    fields: [ip && { name: 'IP', value: ip, inline: true }].filter(Boolean),
  });

export const notifyServerStarted = (port, nodeEnv) =>
  notifyDiscord({
    emoji: '🟢',
    title: 'FinBook API Started',
    description: `Listening on port **${port}** (${nodeEnv})`,
    color: COLORS.success,
  });

export const notifyServerStopped = (signal) =>
  notifyDiscord({
    emoji: '🟡',
    title: 'FinBook API Shutting Down',
    description: `Received **${signal}**`,
    color: COLORS.warning,
  });
