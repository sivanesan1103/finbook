import prisma from '../../config/db.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiError } from '../../utils/apiError.js';
import { logActivity } from '../../middlewares/activity.js';

const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });

export const list = asyncHandler(async (req, res) => {
  const members = await prisma.businessMember.findMany({
    where: { businessId: req.business.id, deletedAt: null },
    include: { user: { select: { id: true, name: true, phone: true, email: true, avatarUrl: true } } },
    orderBy: { createdAt: 'asc' },
  });
  ok(res, members);
});

/**
 * Adds staff/partner by email. If the email has no account yet, a placeholder
 * user is created — they claim it by registering with the same email.
 */
export const add = asyncHandler(async (req, res) => {
  const { email, name, role, permissions } = req.body;

  let user = await prisma.user.findFirst({ where: { email, deletedAt: null } });
  if (!user) {
    user = await prisma.user.create({ data: { name: name || email.split('@')[0], email, role: 'STAFF' } });
  }

  const existing = await prisma.businessMember.findUnique({
    where: { businessId_userId: { businessId: req.business.id, userId: user.id } },
  });
  if (existing && !existing.deletedAt) throw ApiError.conflict('Already a member of this business');

  const member = existing
    ? await prisma.businessMember.update({
        where: { id: existing.id },
        data: { role, permissions, deletedAt: null },
        include: { user: true },
      })
    : await prisma.businessMember.create({
        data: { businessId: req.business.id, userId: user.id, role, permissions },
        include: { user: true },
      });

  await prisma.notification.create({
    data: {
      userId: user.id,
      title: 'Added to a business',
      body: `You were added to ${req.business.name} as ${role}`,
      type: 'STAFF',
    },
  });
  logActivity(req, 'STAFF_ADDED', 'BusinessMember', member.id, { email, role });
  ok(res, member, 201);
});

export const update = asyncHandler(async (req, res) => {
  const member = await prisma.businessMember.findFirst({
    where: { id: req.params.memberId, businessId: req.business.id, deletedAt: null },
  });
  if (!member) throw ApiError.notFound('Member not found');
  if (member.role === 'OWNER' && req.body.role && req.body.role !== 'OWNER') {
    throw ApiError.badRequest('Cannot change the owner role');
  }
  const updated = await prisma.businessMember.update({
    where: { id: member.id },
    data: req.body,
    include: { user: true },
  });
  logActivity(req, 'STAFF_UPDATED', 'BusinessMember', member.id, req.body);
  ok(res, updated);
});

export const remove = asyncHandler(async (req, res) => {
  const member = await prisma.businessMember.findFirst({
    where: { id: req.params.memberId, businessId: req.business.id, deletedAt: null },
  });
  if (!member) throw ApiError.notFound('Member not found');
  if (member.role === 'OWNER') throw ApiError.badRequest('Cannot remove the owner');
  await prisma.businessMember.update({ where: { id: member.id }, data: { deletedAt: new Date() } });
  logActivity(req, 'STAFF_REMOVED', 'BusinessMember', member.id);
  ok(res, { removed: true });
});
