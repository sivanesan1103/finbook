import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../middlewares/validate.js';
import { requireAuth, requireBusiness, requireRole } from '../../middlewares/auth.js';
import * as ctrl from './staff.controller.js';

const router = Router({ mergeParams: true });
router.use(requireAuth, requireBusiness, requireRole('OWNER', 'PARTNER'));

const permissionFlags = z.object({
  parties: z.boolean().optional(),
  bills: z.boolean().optional(),
  items: z.boolean().optional(),
  cashbook: z.boolean().optional(),
  reports: z.boolean().optional(),
}).optional();

router.get('/', ctrl.list);
router.post('/', validate({
  body: z.object({
    email: z.string().email(),
    name: z.string().min(2).max(80).optional(),
    role: z.enum(['PARTNER', 'STAFF']).default('STAFF'),
    permissions: permissionFlags,
  }),
}), ctrl.add);
router.patch('/:memberId', validate({
  body: z.object({ role: z.enum(['PARTNER', 'STAFF']).optional(), permissions: permissionFlags }),
}), ctrl.update);
router.delete('/:memberId', ctrl.remove);

export default router;
