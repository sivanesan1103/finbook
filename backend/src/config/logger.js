import winston from 'winston';
import env from './env.js';

// JSON output (not the old printf text) so Promtail/Loki can parse fields
// like `type`, `action`, `ip` out of every line instead of just storing an
// opaque string — see docker-compose's loki/promtail/grafana services.
const logger = winston.createLogger({
  level: env.nodeEnv === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'finbook-api' },
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/app.log', maxsize: 5_000_000, maxFiles: 3 }),
  ],
});

export default logger;
