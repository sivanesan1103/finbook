import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../middlewares/validate.js';
import { moneyAmount } from '../../utils/money.js';
import { requireAuth, requireBusiness, requirePermission } from '../../middlewares/auth.js';
import * as ctrl from './cashbook.controller.js';

const router = Router({ mergeParams: true });
router.use(requireAuth, requireBusiness, requirePermission('cashbook'));

const entryBody = z.object({
  direction: z.enum(['IN', 'OUT']),
  amount: moneyAmount,
  paymentMode: z.enum(['CASH', 'ONLINE', 'CHEQUE', 'UPI', 'BANK']).optional(),
  description: z.string().max(500).optional(),
  entryDate: z.coerce.date().optional(),
});

router.get('/', ctrl.list);
router.get('/summary', ctrl.summary);
router.get('/report.pdf', ctrl.reportPdf);
router.post('/', validate({ body: entryBody }), ctrl.create);
router.patch('/:entryId', validate({ body: entryBody.partial() }), ctrl.update);
router.delete('/:entryId', ctrl.softDelete);

export default router;
