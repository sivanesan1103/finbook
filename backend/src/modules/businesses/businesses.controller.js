import prisma from '../../config/db.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiError } from '../../utils/apiError.js';
import { logActivity } from '../../middlewares/activity.js';
import { fileUrl } from '../../middlewares/upload.js';

const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });

/** All books the user belongs to, with party counts (book switcher). */
export const listMine = asyncHandler(async (req, res) => {
  const memberships = await prisma.businessMember.findMany({
    where: { userId: req.user.id, deletedAt: null, business: { deletedAt: null } },
    include: { business: { include: { _count: { select: { parties: { where: { deletedAt: null } } } } } } },
    orderBy: { createdAt: 'asc' },
  });
  ok(res, memberships.map((m) => ({
    ...m.business,
    role: m.role,
    permissions: m.permissions,
    partyCount: m.business._count.parties,
  })));
});

export const create = asyncHandler(async (req, res) => {
  const business = await prisma.business.create({
    data: {
      ...req.body,
      ownerId: req.user.id,
      members: { create: { userId: req.user.id, role: 'OWNER' } },
    },
  });
  logActivity(req, 'BUSINESS_CREATED', 'Business', business.id, { name: business.name });
  ok(res, business, 201);
});

export const getOne = asyncHandler(async (req, res) => ok(res, req.business));

export const update = asyncHandler(async (req, res) => {
  const business = await prisma.business.update({ where: { id: req.business.id }, data: req.body });
  logActivity(req, 'BUSINESS_UPDATED', 'Business', business.id, req.body);
  ok(res, business);
});

export const uploadLogo = asyncHandler(async (req, res) => {
  const business = await prisma.business.update({
    where: { id: req.business.id },
    data: { logoUrl: fileUrl(req) },
  });
  ok(res, business);
});

export const softDelete = asyncHandler(async (req, res) => {
  if (req.membership.role !== 'OWNER') throw ApiError.forbidden('Only the owner can delete a book');
  await prisma.business.update({ where: { id: req.business.id }, data: { deletedAt: new Date() } });
  logActivity(req, 'BUSINESS_DELETED', 'Business', req.business.id);
  ok(res, { deleted: true });
});
