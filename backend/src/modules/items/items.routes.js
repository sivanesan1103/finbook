import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../middlewares/validate.js';
import { requireAuth, requireBusiness, requirePermission, requireRole } from '../../middlewares/auth.js';
import { upload } from '../../middlewares/upload.js';
import * as ctrl from './items.controller.js';

const router = Router({ mergeParams: true });
router.use(requireAuth, requireBusiness, requirePermission('items'));

// Upper bounds mirror the column types in schema.prisma — prices are
// Decimal(12,2) and quantities Decimal(12,3), so anything larger is
// rejected here as a 400. Without these caps an oversized value reached
// Prisma and came back as a 500 with the raw driver error ("Out of range
// value for column 'stockQty'") leaked to the client.
const MAX_MONEY = 99_999_999;   // fits Decimal(12,2)
const MAX_QTY = 999_999_999;    // fits Decimal(12,3)

const itemBody = z.object({
  name: z.string().min(1).max(120),
  sku: z.string().max(60).optional(),
  unit: z.string().max(20).optional(),
  salePrice: z.coerce.number().nonnegative().max(MAX_MONEY),
  purchasePrice: z.coerce.number().nonnegative().max(MAX_MONEY).optional(),
  taxRate: z.coerce.number().min(0).max(100).optional(),
  stockQty: z.coerce.number().nonnegative().max(MAX_QTY).optional(),
  lowStockAlert: z.coerce.number().nonnegative().max(MAX_QTY).optional(),
});

router.get('/', ctrl.list);
router.get('/:itemId', ctrl.getOne);
router.post('/', upload.single('image'), validate({ body: itemBody }), ctrl.create);
router.patch('/:itemId', upload.single('image'), validate({ body: itemBody.partial() }), ctrl.update);
router.post('/:itemId/stock', validate({
  body: z.object({
    type: z.enum(['IN', 'OUT', 'ADJUST']),
    qty: z.coerce.number().nonnegative().max(MAX_QTY),
    note: z.string().max(200).optional(),
  }),
}), ctrl.adjustStock);
router.delete('/:itemId', requireRole('OWNER', 'PARTNER'), ctrl.softDelete);

export default router;
