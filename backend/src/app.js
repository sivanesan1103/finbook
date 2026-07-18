import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
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

const app = express();

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({
  origin: env.corsOrigins.includes('*') ? true : env.corsOrigins,
  credentials: true,
}));
app.use(express.json({ limit: '25mb' })); // large enough for backup-file imports
app.use(express.urlencoded({ extended: true }));
app.use(morgan('tiny', { stream: { write: (msg) => logger.debug(msg.trim()) } }));

// Static uploads (bill photos, avatars, logos)
app.use('/uploads', express.static(path.resolve(env.upload.dir)));

// Swagger docs
try {
  const spec = YAML.load(path.resolve('docs/openapi.yaml'));
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(spec));
} catch {
  logger.warn('openapi.yaml not found — /api/docs disabled');
}

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'bizkhata-api', ts: new Date() }));

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
app.use('/api/v1', v1);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
