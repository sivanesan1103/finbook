import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yamljs';

import env from './config/env.js';
import logger from './config/logger.js';
import { notFoundHandler, errorHandler } from './middlewares/error.js';

import authRoutes from './modules/auth/auth.routes.js';
import businessRoutes from './modules/businesses/businesses.routes.js';
import partyRoutes from './modules/parties/parties.routes.js';
import transactionRoutes from './modules/transactions/transactions.routes.js';
import cashbookRoutes from './modules/cashbook/cashbook.routes.js';
import expenseRoutes from './modules/expenses/expenses.routes.js';
import itemRoutes from './modules/items/items.routes.js';
import invoiceRoutes from './modules/invoices/invoices.routes.js';
import proformaRoutes from './modules/invoices/proforma.routes.js';
import staffRoutes from './modules/staff/staff.routes.js';
import reminderRoutes from './modules/reminders/reminders.routes.js';
import reportRoutes from './modules/reports/reports.routes.js';
import notificationRoutes from './modules/notifications/notifications.routes.js';
import activityRoutes from './modules/activity/activity.routes.js';
import clientLogsRoutes from './modules/clientLogs/clientLogs.routes.js';

const app = express();

// Exactly one hop of proxying in front of this container in every real
// deployment (Cloudflare Tunnel in production; direct/no proxy locally) —
// `true` (trust unconditionally) makes express-rate-limit refuse to start
// its IP-based limiters, since a client could spoof X-Forwarded-For to
// bypass them; a specific hop count avoids that while still resolving the
// real client IP for logging.
app.set('trust proxy', 1);

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({
  origin: env.corsOrigins.includes('*') ? true : env.corsOrigins,
  credentials: true,
}));
app.use(express.json({ limit: '25mb' })); // large enough for backup-file imports
app.use(express.urlencoded({ extended: true }));

// Structured access log (method/path/status/ms/ip/userId) for every request,
// feeding the same Loki/Grafana pipeline as activity + client-error logs —
// this is what makes "who accessed from which IP" queryable on the dashboard.
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    logger.info('access', {
      type: 'access',
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      ms: Date.now() - start,
      ip: req.ip,
      userId: req.user?.id ?? null,
    });
  });
  next();
});

// Static uploads (bill photos, avatars, logos)
app.use('/uploads', express.static(path.resolve(env.upload.dir)));

// Swagger docs
try {
  const spec = YAML.load(path.resolve('docs/openapi.yaml'));
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(spec));
} catch {
  logger.warn('openapi.yaml not found — /api/docs disabled');
}

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'finbook-api', ts: new Date() }));

// Login/register are brute-force targets — limit those tightly; everything
// else under /api/v1 gets a much looser cap just to blunt abusive clients.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many attempts — please try again later' },
});
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests — please try again later' },
});
app.use('/api/v1/auth/login', authLimiter);
app.use('/api/v1/auth/register', authLimiter);
app.use('/api/v1', apiLimiter);

const v1 = express.Router();
v1.use('/auth', authRoutes);
v1.use('/businesses', businessRoutes);
v1.use('/businesses/:businessId/parties', partyRoutes);
v1.use('/businesses/:businessId', transactionRoutes); // /parties/:partyId/transactions + /transactions/:txId
v1.use('/businesses/:businessId/cashbook', cashbookRoutes);
v1.use('/businesses/:businessId/expenses', expenseRoutes);
v1.use('/businesses/:businessId/items', itemRoutes);
v1.use('/businesses/:businessId/invoices', invoiceRoutes);
v1.use('/businesses/:businessId/proforma-invoices', proformaRoutes);
v1.use('/businesses/:businessId/staff', staffRoutes);
v1.use('/businesses/:businessId/reminders', reminderRoutes);
v1.use('/businesses/:businessId/reports', reportRoutes);
v1.use('/businesses/:businessId/activity', activityRoutes);
v1.use('/notifications', notificationRoutes);
v1.use('/client-logs', clientLogsRoutes);
app.use('/api/v1', v1);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
