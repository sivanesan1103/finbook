import { asyncHandler } from '../../utils/asyncHandler.js';
import { fileUrl } from '../../middlewares/upload.js';
import * as service from './auth.service.js';

const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });

export const register = asyncHandler(async (req, res) => ok(res, await service.register(req.body), 201));
export const login = asyncHandler(async (req, res) => ok(res, await service.login(req.body)));
export const refresh = asyncHandler(async (req, res) => ok(res, await service.refresh(req.body)));
export const logout = asyncHandler(async (req, res) => ok(res, await service.logout(req.body)));

export const me = asyncHandler(async (req, res) => ok(res, service.sanitize(req.user)));

export const updateProfile = asyncHandler(async (req, res) =>
  ok(res, await service.updateProfile(req.user.id, req.body))
);

export const uploadAvatar = asyncHandler(async (req, res) =>
  ok(res, await service.updateProfile(req.user.id, { avatarUrl: fileUrl(req) }))
);
