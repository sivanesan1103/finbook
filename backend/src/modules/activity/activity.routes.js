import { Router } from 'express';
import prisma from '../../config/db.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { requireAuth, requireBusiness } from '../../middlewares/auth.js';
import { getPagination, paged } from '../../utils/pagination.js';

const router = Router({ mergeParams: true });
router.use(requireAuth, requireBusiness);

router.get('/', asyncHandler(async (req, res) => {
  const { page, limit, skip, take } = getPagination(req.query);
  const where = {
    businessId: req.business.id,
    ...(req.query.entity ? { entity: req.query.entity } : {}),
    ...(req.query.userId ? { userId: req.query.userId } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.activityLog.findMany({
      where,
      include: { user: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
    prisma.activityLog.count({ where }),
  ]);
  res.json({ success: true, ...paged(rows, total, { page, limit }) });
}));

export default router;
