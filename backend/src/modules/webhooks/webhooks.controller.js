import prisma from '../../config/db.js';
import logger from '../../config/logger.js';
import env from '../../config/env.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { isValidTwilioSignature } from '../../utils/twilioSignature.js';
import {
  smsGateway,
  last10Digits,
  buildInvoiceConfirmedAckMessage,
  buildReminderConfirmedAckMessage,
} from '../../utils/sms.js';

const CONFIRM_RE = /^\s*(yes|y|confirm|confirmed)\s*[.!]?\s*$/i;
const OPEN_INVOICE_STATUSES = ['UNPAID', 'PARTIAL', 'OPEN'];

const sendTwiml = (res) => res.type('text/xml').status(200).send('<Response></Response>');

const logConfirmation = (businessId, action, entity, entityId, partyName) => {
  prisma.activityLog
    .create({ data: { businessId, action, entity, entityId, meta: { party: partyName } } })
    .catch((e) => logger.warn(`activity log failed: ${e.message}`));
};

/**
 * Twilio calls this when a customer replies on WhatsApp. If the reply is a
 * "YES" and the party has a pending (unconfirmed) invoice or reminder, the
 * more recently sent one is marked confirmed and an ack is sent back.
 */
export const handleTwilioWhatsApp = asyncHandler(async (req, res) => {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (authToken) {
    const url = env.publicBaseUrl
      ? `${env.publicBaseUrl}/api/webhooks/twilio/whatsapp`
      : `${req.protocol}://${req.get('host')}${req.originalUrl}`;
    const valid = isValidTwilioSignature({
      authToken,
      url,
      params: req.body,
      signature: req.get('X-Twilio-Signature'),
    });
    if (!valid) {
      logger.warn('[webhooks:twilio] rejected: invalid signature');
      return res.status(403).send('Invalid signature');
    }
  } else {
    logger.warn('[webhooks:twilio] TWILIO_AUTH_TOKEN not set — skipping signature check (dev mode)');
  }

  const from = String(req.body.From || '').replace(/^whatsapp:/, '');
  const body = String(req.body.Body || '');
  const digits = last10Digits(from);

  if (!digits || !CONFIRM_RE.test(body)) {
    return sendTwiml(res);
  }

  // Phones may be stored with spaces/formatting, so a DB-level `contains` on
  // the raw digits can miss matches — filter by normalized last-10-digits in JS instead.
  const candidates = await prisma.party.findMany({
    where: { deletedAt: null, phone: { not: null } },
    select: { id: true, businessId: true, name: true, phone: true },
  });
  const parties = candidates.filter((p) => last10Digits(p.phone) === digits);

  for (const party of parties) {
    const [invoice] = await prisma.invoice.findMany({
      where: {
        businessId: party.businessId,
        partyId: party.id,
        deletedAt: null,
        confirmedAt: null,
        status: { in: OPEN_INVOICE_STATUSES },
      },
      orderBy: { issueDate: 'desc' },
      take: 1,
    });
    const [reminder] = await prisma.reminder.findMany({
      where: { businessId: party.businessId, partyId: party.id, confirmedAt: null, status: 'SENT' },
      orderBy: { sentAt: 'desc' },
      take: 1,
    });
    if (!invoice && !reminder) continue;

    const invoiceTime = invoice ? new Date(invoice.issueDate).getTime() : -Infinity;
    const reminderTime = reminder?.sentAt ? new Date(reminder.sentAt).getTime() : -Infinity;

    if (invoiceTime >= reminderTime) {
      await prisma.invoice.update({ where: { id: invoice.id }, data: { confirmedAt: new Date() } });
      logConfirmation(party.businessId, 'INVOICE_CONFIRMED_BY_CUSTOMER', 'Invoice', invoice.id, party.name);
      await smsGateway.send({
        to: from,
        message: buildInvoiceConfirmedAckMessage({ invoiceNo: invoice.invoiceNo }),
        channel: 'WHATSAPP',
      });
    } else {
      await prisma.reminder.update({ where: { id: reminder.id }, data: { confirmedAt: new Date() } });
      logConfirmation(party.businessId, 'REMINDER_CONFIRMED_BY_CUSTOMER', 'Reminder', reminder.id, party.name);
      await smsGateway.send({ to: from, message: buildReminderConfirmedAckMessage(), channel: 'WHATSAPP' });
    }
  }

  return sendTwiml(res);
});
