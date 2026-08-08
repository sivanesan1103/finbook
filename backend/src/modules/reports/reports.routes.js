import { Router } from 'express';
import { requireAuth, requireBusiness, requirePermission, requireRole } from '../../middlewares/auth.js';
import * as ctrl from './reports.controller.js';

const router = Router({ mergeParams: true });
router.use(requireAuth, requireBusiness);

// A report is gated by the permission for the DATA it exposes, not by a
// blanket "reports" flag. Previously any staff with the single `reports`
// permission could read party balances, cashbook, sales and purchases —
// data they had no direct-module access to. Now each report requires the
// same permission its module does, so "let this staff see sales reports"
// means giving them `bills`, nothing more.
const parties = requirePermission('parties');
const bills = requirePermission('bills');

// Dashboard aggregates EVERY module (party balances, cash, expenses, sales),
// so it stays owner/partner-only rather than exposing a partial cross-cut.
router.get('/dashboard', requireRole('OWNER', 'PARTNER'), ctrl.dashboard);

router.get('/transactions', parties, ctrl.transactionsReport);
router.get('/transactions.pdf', parties, ctrl.transactionsReportPdf);
router.get('/parties/summary', parties, ctrl.partiesSummary);
router.get('/purchases', parties, ctrl.purchasesReport); // supplier ledger = party data

router.get('/sales', bills, ctrl.salesReport);
router.get('/sales.pdf', bills, ctrl.salesReportPdf);

export default router;
