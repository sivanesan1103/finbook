import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../middlewares/validate.js';
import { moneyAmount } from '../../utils/money.js';
import { requireAuth, requireBusiness, requirePermission } from '../../middlewares/auth.js';
import { upload } from '../../middlewares/upload.js';
import * as ctrl from './expenses.controller.js';

const router = Router({ mergeParams: true });
router.use(requireAuth, requireBusiness, requirePermission('expenses'));

const expenseBody = z.object({
  category: z.string().max(60).optional(),
  amount: moneyAmount,
  notes: z.string().max(500).optional(),
  paymentMode: z.enum(['CASH', 'ONLINE', 'CHEQUE', 'UPI', 'BANK']).optional(),
  entryDate: z.coerce.date().optional(),
});

const expenseItemBody = z.object({
  name: z.string().min(1).max(80),
  price: z.coerce.number().positive().optional(),
});

router.get('/', ctrl.list);
router.get('/by-category', ctrl.byCategory);
router.get('/items', ctrl.listItems);
router.post('/items', validate({ body: expenseItemBody }), ctrl.createItem);
router.delete('/items/:itemId', ctrl.deleteItem);
router.post('/', upload.single('attachment'), validate({ body: expenseBody }), ctrl.create);
router.patch('/:expenseId', upload.single('attachment'), validate({ body: expenseBody.partial() }), ctrl.update);
router.delete('/:expenseId', ctrl.softDelete);

export default router;
