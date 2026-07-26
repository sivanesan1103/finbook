import { asyncHandler } from '../../utils/asyncHandler.js';
import { fileUrl } from '../../middlewares/upload.js';
import logger from '../../config/logger.js';
import { notifyLoginFailed } from '../../config/discordNotifier.js';
import * as service from './auth.service.js';

const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });

// Auth events log directly (rather than via logActivity) since there's no
// req.user/req.business yet at login/register time — the whole point of
// these lines is to capture who's authenticating and from where.
const logAuth = (req, action, extra) =>
  logger.info(action.toLowerCase(), { type: 'activity', action, ip: req.ip, userAgent: req.headers['user-agent'], ...extra });

export const register = asyncHandler(async (req, res) => {
  const data = await service.register(req.body);
  logAuth(req, 'REGISTER', { userId: data.user.id, email: data.user.email });
  ok(res, data, 201);
});

export const login = asyncHandler(async (req, res) => {
  try {
    const data = await service.login(req.body);
    logAuth(req, 'LOGIN', { userId: data.user.id, email: data.user.email });
    ok(res, data);
  } catch (e) {
    logAuth(req, 'LOGIN_FAILED', { email: req.body?.email });
    notifyLoginFailed(req.body?.email, req.ip, req.headers['user-agent']);
    throw e;
  }
});

export const refresh = asyncHandler(async (req, res) => ok(res, await service.refresh(req.body)));

export const logout = asyncHandler(async (req, res) => {
  const data = await service.logout(req.body);
  logAuth(req, 'LOGOUT', {});
  ok(res, data);
});

export const me = asyncHandler(async (req, res) => ok(res, service.sanitize(req.user)));

export const updateProfile = asyncHandler(async (req, res) =>
  ok(res, await service.updateProfile(req.user.id, req.body))
);

export const uploadAvatar = asyncHandler(async (req, res) =>
  ok(res, await service.updateProfile(req.user.id, { avatarUrl: fileUrl(req) }))
);
