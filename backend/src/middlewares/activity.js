import prisma from '../config/db.js';
import logger from '../config/logger.js';

/**
 * Fire-and-forget audit log entry. Never blocks or fails the request.
 * logActivity(req, 'TRANSACTION_CREATED', 'Transaction', tx.id, { amount })
 */
export const logActivity = (req, action, entity, entityId, meta) => {
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
