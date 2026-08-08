import { ApiError } from '../utils/apiError.js';
import logger from '../config/logger.js';
import env from '../config/env.js';
import { notifyServerError } from '../config/discordNotifier.js';

export const notFoundHandler = (req, _res, next) =>
  next(new ApiError(404, `Route not found: ${req.method} ${req.originalUrl}`));

// eslint-disable-next-line no-unused-vars
export const errorHandler = (err, req, res, _next) => {
  // Prisma known errors → friendly messages
  if (err.code === 'P2002') err = ApiError.conflict('A record with that value already exists');
  if (err.code === 'P2025') err = ApiError.notFound('Record not found');

  // Multer upload errors are client mistakes (file too big, wrong field), not
  // server faults — they were surfacing as a 500 with the generic message.
  if (err.name === 'MulterError') {
    const msg = err.code === 'LIMIT_FILE_SIZE'
      ? `File is too large (max ${env.upload.maxMb} MB)`
      : err.code === 'LIMIT_UNEXPECTED_FILE'
        ? 'Unexpected file field'
        : `Upload failed: ${err.message}`;
    err = ApiError.badRequest(msg);
  }

  const status = err.status || 500;
  if (status >= 500) {
    logger.error(err.message, { type: 'server_error', stack: err.stack, path: req.originalUrl, ip: req.ip });
    notifyServerError(err.message, {
      path: req.originalUrl,
      method: req.method,
      status,
      ip: req.ip,
      userId: req.user?.id,
      stack: err.stack,
    });
  } else logger.debug(`${status} ${err.message}`);

  // 5xx messages are never echoed back in production: an unhandled driver
  // error carries internals (e.g. Prisma's "Invalid `prisma.item.create()`
  // invocation … Out of range value for column 'stockQty'"), which leaks the
  // schema to any caller and reads as gibberish to a shop owner. The real
  // message is still logged above and pushed to Discord.
  const clientMessage = status >= 500 && env.nodeEnv !== 'development'
    ? 'Something went wrong on our side. Please try again.'
    : err.message || 'Internal server error';

  res.status(status).json({
    success: false,
    message: clientMessage,
    details: err.details,
    ...(env.nodeEnv === 'development' && status >= 500 ? { stack: err.stack } : {}),
  });
};
