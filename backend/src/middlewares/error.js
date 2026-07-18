import { ApiError } from '../utils/apiError.js';
import logger from '../config/logger.js';
import env from '../config/env.js';

export const notFoundHandler = (req, _res, next) =>
  next(new ApiError(404, `Route not found: ${req.method} ${req.originalUrl}`));

// eslint-disable-next-line no-unused-vars
export const errorHandler = (err, req, res, _next) => {
  // Prisma known errors → friendly messages
  if (err.code === 'P2002') err = ApiError.conflict('A record with that value already exists');
  if (err.code === 'P2025') err = ApiError.notFound('Record not found');

  const status = err.status || 500;
  if (status >= 500) logger.error(err);
  else logger.debug(`${status} ${err.message}`);

  res.status(status).json({
    success: false,
    message: err.message || 'Internal server error',
    details: err.details,
    ...(env.nodeEnv === 'development' && status >= 500 ? { stack: err.stack } : {}),
  });
};
