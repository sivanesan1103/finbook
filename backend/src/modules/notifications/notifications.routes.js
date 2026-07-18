import { Router } from 'express';
import prisma from '../../config/db.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { requireAuth } from '../../middlewares/auth.js';

const router = Router();
router.use(requireAuth);

router.get('/', asyncHandler(async (req, res) => {
  const notifications = await prisma.notification.findMany({
    where: { userId: req.user.id },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  const unread = await prisma.notification.count({ where: { userId: req.user.id, readAt: null } });
  res.json({ success: true, data: notifications, unread });
}));

router.post('/:id/read', asyncHandler(async (req, res) => {
  await prisma.notification.updateMany({
    where: { id: req.params.id, userId: req.user.id },
    data: { readAt: new Date() },
  });
  res.json({ success: true });
}));

router.post('/read-all', asyncHandler(async (req, res) => {
  await prisma.notification.updateMany({
    where: { userId: req.user.id, readAt: null },
    data: { readAt: new Date() },
  });
  res.json({ success: true });
}));

export default router;
