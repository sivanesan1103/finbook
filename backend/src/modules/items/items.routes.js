import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../middlewares/validate.js';
import { requireAuth, requireBusiness, requirePermission } from '../../middlewares/auth.js';
import { upload } from '../../middlewares/upload.js';
import * as ctrl from './items.controller.js';

const router = Router({ mergeParams: true });
router.use(requireAuth, requireBusiness, requirePermission('items'));

const itemBody = z.object({
  name: z.string().min(1).max(120),
  sku: z.string().max(60).optional(),
  unit: z.string().max(20).optional(),
  salePrice: z.coerce.number().nonnegative(),
  purchasePrice: z.coerce.number().nonnegative().optional(),
  taxRate: z.coerce.number().min(0).max(100).optional(),
  stockQty: z.coerce.number().nonnegative().optional(),
  lowStockAlert: z.coerce.number().nonnegative().optional(),
});

router.get('/', ctrl.list);
router.get('/:itemId', ctrl.getOne);
router.post('/', upload.single('image'), validate({ body: itemBody }), ctrl.create);
router.patch('/:itemId', upload.single('image'), validate({ body: itemBody.partial() }), ctrl.update);
router.post('/:itemId/stock', validate({
  body: z.object({
    type: z.enum(['IN', 'OUT', 'ADJUST']),
    qty: z.coerce.number().nonnegative(),
    note: z.string().max(200).optional(),
  }),
}), ctrl.adjustStock);
router.delete('/:itemId', ctrl.softDelete);

export default router;
