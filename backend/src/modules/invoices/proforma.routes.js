import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../middlewares/validate.js';
import { requireAuth, requireBusiness, requirePermission, requireRole } from '../../middlewares/auth.js';
import * as ctrl from './invoices.controller.js';

/**
 * Proforma invoices (Khatabook-style estimates/quotations).
 * Same shape as invoices but: no payments, no stock impact, and an
 * OPEN → CONVERTED lifecycle via POST /:invoiceId/convert.
 */
const router = Router({ mergeParams: true });
router.use(requireAuth, requireBusiness, requirePermission('bills'));
router.use((req, _res, next) => { req.docType = 'PROFORMA'; next(); });

const proformaBody = z.object({
  partyId: z.string(),
  items: z.array(z.object({
    itemId: z.string().optional(),
    name: z.string().min(1).max(120),
    qty: z.coerce.number().positive(),
    price: z.coerce.number().nonnegative(),
    taxRate: z.coerce.number().min(0).max(100).optional(),
  })).min(1),
  discount: z.coerce.number().nonnegative().optional(),
  dueDate: z.coerce.date().optional(),
  notes: z.string().max(500).optional(),
});

router.get('/', ctrl.list);
router.get('/:invoiceId', ctrl.getOne);
router.get('/:invoiceId/pdf', ctrl.pdf);
router.post('/', validate({ body: proformaBody }), ctrl.create);
router.post('/:invoiceId/convert', ctrl.convert);
router.post('/:invoiceId/cancel', requireRole('OWNER', 'PARTNER'), ctrl.cancel);
router.delete('/:invoiceId', requireRole('OWNER', 'PARTNER'), ctrl.softDelete);

export default router;
