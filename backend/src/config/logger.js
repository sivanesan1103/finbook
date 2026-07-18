import winston from 'winston';
import env from './env.js';

const logger = winston.createLogger({
  level: env.nodeEnv === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ timestamp, level, message, stack }) =>
      `${timestamp} [${level.toUpperCase()}] ${stack || message}`
    )
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/app.log', maxsize: 5_000_000, maxFiles: 3 }),
  ],
});

export default logger;
