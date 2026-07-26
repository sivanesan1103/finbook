import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as ctrl from './public.controller.js';

const router = Router();

// Unauthenticated by design (see public.controller.js) — bounded rate limit
// so the token space can't be brute-forced or the ledger-lookup scraped.
const limiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
});

router.get('/entries/:token', limiter, ctrl.getEntry);

export default router;
