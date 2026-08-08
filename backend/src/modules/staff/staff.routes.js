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
  expenses: z.boolean().optional(),
  reports: z.boolean().optional(),
}).optional();

router.get('/', ctrl.list);
// Adding a member sets their password, so it's OWNER-only — PARTNERs can
// still view/edit permissions/remove (router-level requireRole above), just
// not mint new credentials.
router.post('/', requireRole('OWNER'), validate({
  body: z.object({
    email: z.string().email(),
    name: z.string().min(2).max(80),
    role: z.enum(['PARTNER', 'STAFF']).default('STAFF'),
    permissions: permissionFlags,
    password: z.string().min(6).max(100),
  }),
}), ctrl.add);
router.patch('/:memberId', validate({
  body: z.object({ role: z.enum(['PARTNER', 'STAFF']).optional(), permissions: permissionFlags }),
}), ctrl.update);
router.delete('/:memberId', ctrl.remove);

export default router;
