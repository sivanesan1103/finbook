import logger from '../../config/logger.js';
import { notifyClientCrash } from '../../config/discordNotifier.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

/**
 * Unhandled errors/crashes reported by the web app or the Flutter app.
 * Deliberately doesn't require auth — a crash can happen before login or
 * with an expired token, and we still want to see it on the dashboard.
 */
export const report = asyncHandler(async (req, res) => {
  const { platform, level, message, stack, appVersion, device, userId, extra } = req.body;
  logger.error('client error', {
    type: 'client_error',
    platform,
    level,
    message,
    stack,
    appVersion,
    device,
    userId: userId ?? null,
    extra,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  });
  notifyClientCrash({ platform, message, device });
  res.status(201).json({ success: true });
});
