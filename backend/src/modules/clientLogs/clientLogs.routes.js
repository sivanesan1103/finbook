import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { validate } from '../../middlewares/validate.js';
import * as ctrl from './clientLogs.controller.js';

const router = Router();

// Generous but bounded — a crash-looping client shouldn't be able to flood
// the log pipeline, but this isn't a business endpoint so it doesn't need
// the tighter per-user limits the rest of the API uses.
const limiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
});

const bodySchema = z.object({
  platform: z.enum(['web', 'mobile']),
  level: z.enum(['error', 'crash']).default('error'),
  message: z.string().max(2000),
  stack: z.string().max(8000).optional(),
  appVersion: z.string().max(40).optional(),
  device: z.string().max(200).optional(),
  userId: z.string().max(60).optional(),
  extra: z.record(z.string(), z.any()).optional(),
});

router.post('/', limiter, validate({ body: bodySchema }), ctrl.report);

export default router;
