import { Router } from 'express';
import { handleTwilioWhatsApp } from './webhooks.controller.js';

// Public routes — Twilio calls these directly (verified via X-Twilio-Signature, not JWT auth).
const router = Router();

router.post('/twilio/whatsapp', handleTwilioWhatsApp);

export default router;
