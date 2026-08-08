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
  // `reports` is no longer a standalone access flag — report access is
  // derived from the data-type permissions (see reports.routes.js). Still
  // accepted here so older clients that send it don't error.
  reports: z.boolean().optional(),
}).optional();

router.get('/', ctrl.list);
// Lets the add-staff UI decide whether to ask for a password: an email that
// already has an account is added with its existing login (no password),
// a brand-new email needs one created.
router.get('/lookup', ctrl.lookup);
// Adding a member is OWNER-only (it can mint credentials). name/password are
// required only when the email is NEW — for an existing account they're
// ignored, since that person already signs in with their own password. That
// conditional rule is enforced in the controller (validation can't see the
// DB), so both are optional here.
router.post('/', requireRole('OWNER'), validate({
  body: z.object({
    email: z.string().email(),
    name: z.string().min(2).max(80).optional(),
    role: z.enum(['PARTNER', 'STAFF']).default('STAFF'),
    permissions: permissionFlags,
    password: z.string().min(6).max(100).optional(),
  }),
}), ctrl.add);
router.patch('/:memberId', validate({
  body: z.object({ role: z.enum(['PARTNER', 'STAFF']).optional(), permissions: permissionFlags }),
}), ctrl.update);
router.delete('/:memberId', ctrl.remove);

export default router;
