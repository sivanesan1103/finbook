import prisma from '../config/db.js';
import { ApiError } from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { verifyAccessToken } from '../utils/jwt.js';

/** Requires a valid Bearer access token; attaches req.user. */
export const requireAuth = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw ApiError.unauthorized('Missing access token');

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    throw ApiError.unauthorized('Invalid or expired token');
  }

  const user = await prisma.user.findFirst({ where: { id: payload.sub, deletedAt: null } });
  if (!user) throw ApiError.unauthorized('User no longer exists');
  req.user = user;
  next();
});

/**
 * Scopes the request to a business the user belongs to.
 * Reads business id from route param `businessId` (or `x-business-id` header),
 * attaches req.business and req.membership (role + permissions).
 */
export const requireBusiness = asyncHandler(async (req, _res, next) => {
  const businessId = req.params.businessId || req.headers['x-business-id'];
  if (!businessId) throw ApiError.badRequest('businessId is required');

  const membership = await prisma.businessMember.findFirst({
    where: { businessId, userId: req.user.id, deletedAt: null },
    include: { business: true },
  });
  if (!membership || membership.business.deletedAt) {
    throw ApiError.forbidden('You are not a member of this business');
  }
  req.business = membership.business;
  req.membership = membership;
  next();
});

/** Restricts to given business roles, e.g. requireRole('OWNER', 'PARTNER'). */
export const requireRole = (...roles) => (req, _res, next) => {
  if (!req.membership || !roles.includes(req.membership.role)) {
    return next(ApiError.forbidden(`Requires role: ${roles.join(' / ')}`));
  }
  next();
};

/** Checks a granular staff permission flag (owners/partners always pass). */
export const requirePermission = (flag) => (req, _res, next) => {
  const m = req.membership;
  if (m.role === 'OWNER' || m.role === 'PARTNER') return next();
  const perms = m.permissions || {};
  if (perms[flag]) return next();
  next(ApiError.forbidden(`Missing permission: ${flag}`));
};
