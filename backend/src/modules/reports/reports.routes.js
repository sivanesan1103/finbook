import { Router } from 'express';
import { requireAuth, requireBusiness, requirePermission } from '../../middlewares/auth.js';
import * as ctrl from './reports.controller.js';

const router = Router({ mergeParams: true });
router.use(requireAuth, requireBusiness, requirePermission('reports'));

router.get('/dashboard', ctrl.dashboard);
router.get('/transactions', ctrl.transactionsReport);
router.get('/transactions.pdf', ctrl.transactionsReportPdf);
router.get('/sales', ctrl.salesReport);
router.get('/sales.pdf', ctrl.salesReportPdf);
router.get('/purchases', ctrl.purchasesReport);
router.get('/parties/summary', ctrl.partiesSummary);

export default router;
