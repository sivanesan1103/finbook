import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../middlewares/validate.js';
import { requireAuth, requireBusiness, requireRole } from '../../middlewares/auth.js';
import { upload } from '../../middlewares/upload.js';
import * as ctrl from './businesses.controller.js';
import * as backup from './backup.controller.js';

const router = Router();
router.use(requireAuth);

const businessBody = z.object({
  name: z.string().min(1).max(120),
  phone: z.string().trim().regex(/^\+?[0-9][0-9\s-]{6,19}$/, 'Enter a valid phone number').optional().or(z.literal('')),
  email: z.string().email().optional(),
  address: z.string().max(500).optional(),
  gstin: z.string().max(20).optional(),
  category: z.string().max(60).optional(),
  currency: z.string().max(5).optional(),
  upiId: z.string().max(80).optional().nullable(),
  bankName: z.string().max(120).optional().nullable(),
  bankAccountName: z.string().max(120).optional().nullable(),
  bankAccountNo: z.string().max(40).optional().nullable(),
  bankIfsc: z.string().max(20).optional().nullable(),
  invoiceTerms: z.string().max(1000).optional().nullable(),
});

router.get('/', ctrl.listMine);
router.post('/', validate({ body: businessBody }), ctrl.create);
router.get('/:businessId', requireBusiness, ctrl.getOne);
router.patch('/:businessId', requireBusiness, requireRole('OWNER', 'PARTNER'),
  validate({ body: businessBody.partial() }), ctrl.update);
router.post('/:businessId/logo', requireBusiness, requireRole('OWNER', 'PARTNER'),
  upload.single('file'), ctrl.uploadLogo);
router.get('/:businessId/export', requireBusiness, requireRole('OWNER', 'PARTNER'), backup.exportData);
router.post('/:businessId/import', requireBusiness, requireRole('OWNER'), backup.importData);
router.delete('/:businessId', requireBusiness, ctrl.softDelete);

export default router;
