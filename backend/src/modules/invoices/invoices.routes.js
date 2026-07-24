import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../middlewares/validate.js';
import { requireAuth, requireBusiness, requirePermission, requireRole } from '../../middlewares/auth.js';
import * as ctrl from './invoices.controller.js';

const router = Router({ mergeParams: true });
router.use(requireAuth, requireBusiness, requirePermission('bills'));

const invoiceBody = z.object({
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
  status: z.enum(['DRAFT', 'UNPAID']).optional(),
});

router.get('/', ctrl.list);
router.get('/:invoiceId', ctrl.getOne);
router.get('/:invoiceId/pdf', ctrl.pdf);
router.post('/', validate({ body: invoiceBody }), ctrl.create);
router.post('/:invoiceId/payments', validate({
  body: z.object({
    amount: z.coerce.number().positive(),
    mode: z.enum(['CASH', 'ONLINE', 'CHEQUE', 'UPI', 'BANK']).optional(),
    note: z.string().max(200).optional(),
    paidAt: z.coerce.date().optional(),
  }),
}), ctrl.pay);
router.post('/:invoiceId/cancel', requireRole('OWNER', 'PARTNER'), ctrl.cancel);
router.delete('/:invoiceId', requireRole('OWNER', 'PARTNER'), ctrl.softDelete);

export default router;
