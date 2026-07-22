import bcrypt from 'bcryptjs';
import prisma from '../../config/db.js';
import { ApiError } from '../../utils/apiError.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../../utils/jwt.js';
import { issueOtp, verifyOtp } from '../../utils/otp.js';

const sanitize = ({ passwordHash, deletedAt, ...user }) => user;

const issueTokens = async (user) => {
  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);
  const expiresAt = new Date(Date.now() + 30 * 24 * 3600 * 1000);
  await prisma.refreshToken.create({ data: { token: refreshToken, userId: user.id, expiresAt } });
  return { accessToken, refreshToken };
};

const ensureDefaultBusiness = async (user) => {
  const existing = await prisma.businessMember.findFirst({ where: { userId: user.id, deletedAt: null } });
  if (existing) return;
  await prisma.business.create({
    data: {
      name: 'My Business',
      ownerId: user.id,
      email: user.email,
      members: { create: { userId: user.id, role: 'OWNER' } },
    },
  });
};

export const register = async ({ name, email, password }) => {
  const existing = await prisma.user.findFirst({ where: { email, deletedAt: null } });
  // Placeholder users (created by a staff invite) have no password yet —
  // registering with the invited email claims that account.
  if (existing && existing.passwordHash) {
    throw ApiError.conflict('An account with this email already exists');
  }

  const user = existing
    ? await prisma.user.update({
        where: { id: existing.id },
        data: { name, passwordHash: await bcrypt.hash(password, 10) },
      })
    : await prisma.user.create({
        data: { name, email, passwordHash: await bcrypt.hash(password, 10) },
      });
  await ensureDefaultBusiness(user);
  const tokens = await issueTokens(user);
  // Registration succeeds even if the verification email fails to send —
  // the failure is logged inside mailer.send, and the user can request a
  // fresh code via resendOtp (which does surface a failure to the caller).
  await issueOtp(user.email, 'VERIFY_EMAIL');
  return { user: sanitize(user), ...tokens };
};

export const resendOtp = async ({ email }) => {
  const user = await prisma.user.findFirst({ where: { email, deletedAt: null } });
  if (!user) throw ApiError.notFound('No account with this email');
  if (user.emailVerifiedAt) throw ApiError.conflict('Email is already verified');
  const result = await issueOtp(email, 'VERIFY_EMAIL');
  if (!result.sent) throw ApiError.badGateway(`Failed to send verification email: ${result.error || 'unknown error'}`);
  return result;
};

export const verifyEmail = async ({ email, code }) => {
  await verifyOtp(email, code, 'VERIFY_EMAIL');
  const user = await prisma.user.update({
    where: { email },
    data: { emailVerifiedAt: new Date() },
  });
  return sanitize(user);
};

export const login = async ({ email, password }) => {
  const user = await prisma.user.findFirst({
    where: { email, deletedAt: null },
  });
  if (!user || !user.passwordHash) throw ApiError.unauthorized('Invalid credentials');
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) throw ApiError.unauthorized('Invalid credentials');
  await ensureDefaultBusiness(user);
  const tokens = await issueTokens(user);
  return { user: sanitize(user), ...tokens };
};

export const refresh = async ({ refreshToken }) => {
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw ApiError.unauthorized('Invalid refresh token');
  }
  const stored = await prisma.refreshToken.findFirst({ where: { token: refreshToken } });
  if (!stored || stored.revoked || stored.expiresAt < new Date()) {
    throw ApiError.unauthorized('Refresh token revoked or expired');
  }
  const user = await prisma.user.findFirst({ where: { id: payload.sub, deletedAt: null } });
  if (!user) throw ApiError.unauthorized('User not found');

  await prisma.refreshToken.update({ where: { id: stored.id }, data: { revoked: true } });
  const tokens = await issueTokens(user);
  return { user: sanitize(user), ...tokens };
};

export const logout = async ({ refreshToken }) => {
  if (refreshToken) {
    await prisma.refreshToken.updateMany({ where: { token: refreshToken }, data: { revoked: true } });
  }
  return { loggedOut: true };
};

export const updateProfile = async (userId, data) => {
  const user = await prisma.user.update({ where: { id: userId }, data });
  return sanitize(user);
};

export { sanitize };
