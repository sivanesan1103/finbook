import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../middlewares/validate.js';
import { moneyAmount } from '../../utils/money.js';
import { requireAuth, requireBusiness, requirePermission, requireRole } from '../../middlewares/auth.js';
import { upload } from '../../middlewares/upload.js';
import * as ctrl from './transactions.controller.js';

const router = Router({ mergeParams: true });
// This router is mounted at the broad `/businesses/:businessId` prefix (it
// owns both /parties/:id/transactions and /transactions/:id), so a
// router-level `requirePermission('parties')` here would ALSO run on sibling
// paths like /cashbook, /expenses, /reports — locking every staff member
// without `parties` out of the entire app. requireAuth/requireBusiness are
// safe to apply broadly; the `parties` permission is attached per-route
// (`P` below) so it only gates the routes that actually belong to this router.
router.use(requireAuth, requireBusiness);
const P = requirePermission('parties');

const txBody = z.object({
  type: z.enum(['GAVE', 'GOT']),
  amount: moneyAmount,
  description: z.string().max(500).optional(),
  paymentMode: z.enum(['CASH', 'ONLINE', 'CHEQUE', 'UPI', 'BANK']).optional(),
  entryDate: z.coerce.date().optional(),
});

const ledgerQuery = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  type: z.enum(['GAVE', 'GOT']).optional(),
  search: z.string().optional(),
});

// Ledger of one party
router.get('/parties/:partyId/transactions', P, validate({ query: ledgerQuery }), ctrl.ledger);
router.get('/parties/:partyId/statement.pdf', P, validate({ query: ledgerQuery }), ctrl.statementPdf);
router.post('/parties/:partyId/transactions', P, upload.single('billImage'),
  validate({ body: txBody }), ctrl.create);

// Individual entries
router.get('/transactions/:txId', P, ctrl.getOne);
router.get('/transactions/:txId/share', P, ctrl.shareLink);
router.patch('/transactions/:txId', P, upload.single('billImage'),
  validate({ body: txBody.partial() }), ctrl.update);
router.delete('/transactions/:txId', P, requireRole('OWNER', 'PARTNER'), ctrl.softDelete);

export default router;
