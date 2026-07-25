import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../middlewares/validate.js';
import { requireAuth, requireBusiness, requirePermission, requireRole } from '../../middlewares/auth.js';
import { upload } from '../../middlewares/upload.js';
import * as ctrl from './parties.controller.js';
import { partyBody } from './parties.schema.js';

const router = Router({ mergeParams: true });
router.use(requireAuth, requireBusiness, requirePermission('parties'));

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
// Loose shape check only — each row is validated individually inside
// bulkCreate so one bad row (e.g. a messy phone number in a 500-row
// spreadsheet) skips just that row instead of rejecting the whole batch.
router.post('/bulk', validate({
  body: z.object({ parties: z.array(z.record(z.unknown())).min(1).max(500) }),
}), ctrl.bulkCreate);
router.get('/:partyId', ctrl.getOne);
router.patch('/:partyId', validate({ body: partyBody.partial() }), ctrl.update);
router.post('/:partyId/photo', upload.single('file'), ctrl.uploadPhoto);
router.delete('/:partyId', requireRole('OWNER', 'PARTNER'), ctrl.softDelete);

export default router;
