import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../middlewares/validate.js';
import { requireAuth, requireBusiness } from '../../middlewares/auth.js';
import * as ctrl from './reminders.controller.js';

const router = Router({ mergeParams: true });
router.use(requireAuth, requireBusiness);

router.get('/', ctrl.list);
router.post('/', validate({
  body: z.object({
    partyId: z.string(),
    message: z.string().max(500).optional(),
    dueDate: z.coerce.date(),
  }),
}), ctrl.create);
router.post('/:reminderId/send', ctrl.sendNow);
router.post('/:reminderId/cancel', ctrl.cancel);

export default router;
