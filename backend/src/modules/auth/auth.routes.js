import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../middlewares/validate.js';
import { requireAuth } from '../../middlewares/auth.js';
import { upload } from '../../middlewares/upload.js';
import * as ctrl from './auth.controller.js';

const router = Router();

router.post('/register', validate({
  body: z.object({
    name: z.string().min(2).max(80),
    email: z.string().email(),
    password: z.string().min(6).max(100),
  }),
}), ctrl.register);

router.post('/login', validate({
  body: z.object({ email: z.string().email(), password: z.string().min(1) }),
}), ctrl.login);

router.post('/refresh', validate({ body: z.object({ refreshToken: z.string() }) }), ctrl.refresh);
router.post('/logout', validate({ body: z.object({ refreshToken: z.string().optional() }) }), ctrl.logout);

router.post('/verify-email', validate({
  body: z.object({ email: z.string().email(), code: z.string().length(6) }),
}), ctrl.verifyEmail);
router.post('/resend-otp', validate({
  body: z.object({ email: z.string().email() }),
}), ctrl.resendOtp);

router.get('/me', requireAuth, ctrl.me);
router.patch('/me', requireAuth, validate({
  body: z.object({
    name: z.string().min(2).max(80).optional(),
    email: z.string().email().nullable().optional(),
    language: z.string().max(10).optional(),
  }),
}), ctrl.updateProfile);
router.post('/me/avatar', requireAuth, upload.single('file'), ctrl.uploadAvatar);

export default router;
