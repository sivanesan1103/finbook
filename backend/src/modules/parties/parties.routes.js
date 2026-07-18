import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../middlewares/validate.js';
import { requireAuth, requireBusiness, requirePermission } from '../../middlewares/auth.js';
import { upload } from '../../middlewares/upload.js';
import * as ctrl from './parties.controller.js';

const router = Router({ mergeParams: true });
router.use(requireAuth, requireBusiness, requirePermission('parties'));

const partyBody = z.object({
  type: z.enum(['CUSTOMER', 'SUPPLIER']).default('CUSTOMER'),
  name: z.string().min(1).max(120),
  phone: z.string().max(20).optional(),
  email: z.string().email().optional(),
  gstin: z.string().max(20).optional(),
  addressLine: z.string().max(200).optional(),
  area: z.string().max(100).optional(),
  city: z.string().max(80).optional(),
  state: z.string().max(80).optional(),
  pincode: z.string().max(10).optional(),
  smsEnabled: z.boolean().optional(),
});

const listQuery = z.object({
  type: z.enum(['CUSTOMER', 'SUPPLIER']).optional(),
  search: z.string().optional(),
  sort: z.enum(['recent', 'name', 'highest', 'lowest']).optional(),
  page: z.coerce.number().optional(),
  limit: z.coerce.number().optional(),
});

router.get('/', validate({ query: listQuery }), ctrl.list);
router.get('/summary', ctrl.summary);
router.post('/', validate({ body: partyBody }), ctrl.create);
router.post('/bulk', validate({
  body: z.object({ parties: z.array(partyBody).min(1).max(500) }),
}), ctrl.bulkCreate);
router.get('/:partyId', ctrl.getOne);
router.patch('/:partyId', validate({ body: partyBody.partial() }), ctrl.update);
router.post('/:partyId/photo', upload.single('file'), ctrl.uploadPhoto);
router.delete('/:partyId', ctrl.softDelete);

export default router;
