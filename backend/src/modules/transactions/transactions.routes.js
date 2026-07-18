import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../middlewares/validate.js';
import { requireAuth, requireBusiness, requirePermission } from '../../middlewares/auth.js';
import { upload } from '../../middlewares/upload.js';
import * as ctrl from './transactions.controller.js';

const router = Router({ mergeParams: true });
router.use(requireAuth, requireBusiness, requirePermission('parties'));

const txBody = z.object({
  type: z.enum(['GAVE', 'GOT']),
  amount: z.coerce.number().positive().max(99_999_999),
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
router.get('/parties/:partyId/transactions', validate({ query: ledgerQuery }), ctrl.ledger);
router.get('/parties/:partyId/statement.pdf', validate({ query: ledgerQuery }), ctrl.statementPdf);
router.post('/parties/:partyId/transactions', upload.single('billImage'),
  validate({ body: txBody }), ctrl.create);

// Individual entries
router.get('/transactions/:txId', ctrl.getOne);
router.patch('/transactions/:txId', upload.single('billImage'),
  validate({ body: txBody.partial() }), ctrl.update);
router.delete('/transactions/:txId', ctrl.softDelete);

export default router;
