import prisma from '../config/db.js';
import logger from '../config/logger.js';

/**
 * Fire-and-forget audit log entry. Never blocks or fails the request.
 * logActivity(req, 'TRANSACTION_CREATED', 'Transaction', tx.id, { amount })
 */
export const logActivity = (req, action, entity, entityId, meta) => {
  // Stdout (structured, for the Loki/Grafana log dashboard) is written
  // synchronously and independently of the DB write below, so a failed
  // insert never hides the event from the dashboard.
  logger.info('activity', {
    type: 'activity',
    action,
    entity,
    entityId: entityId ?? null,
    businessId: req.business?.id ?? null,
    userId: req.user?.id ?? null,
    ip: req.ip,
    meta,
  });
  prisma.activityLog
    .create({
      data: {
        businessId: req.business?.id ?? null,
        userId: req.user?.id ?? null,
        action,
        entity,
        entityId: entityId ?? null,
        meta: meta ?? undefined,
      },
    })
    .catch((e) => logger.warn(`activity log failed: ${e.message}`));
};
