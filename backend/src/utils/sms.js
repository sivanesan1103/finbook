import logger from '../config/logger.js';

const twilioConfigured = !!(
  process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_WHATSAPP_FROM
);
const waConfigured = !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);

/** Digits-only phone number with country code, defaulting to India (91). */
const toWhatsAppNumber = (phone) => {
  const digits = phone.replace(/[^\d]/g, '');
  return digits.length === 10 ? `91${digits}` : digits;
};

/** Last 10 digits of a phone number, for matching regardless of country-code/formatting differences. */
export const last10Digits = (phone) => (phone || '').replace(/[^\d]/g, '').slice(-10);

const sendViaTwilio = async (to, message) => {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
  const body = new URLSearchParams({
    From: `whatsapp:+${process.env.TWILIO_WHATSAPP_FROM.replace(/[^\d]/g, '')}`,
    To: `whatsapp:+${toWhatsAppNumber(to)}`,
    Body: message,
  });
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`Twilio send failed (${res.status}): ${errBody}`);
  }
  return res.json();
};

const sendViaWhatsAppCloud = async (to, message) => {
  const url = `https://graph.facebook.com/v20.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: toWhatsAppNumber(to),
      type: 'text',
      text: { body: message },
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`WhatsApp send failed (${res.status}): ${body}`);
  }
  return res.json();
};

/**
 * SMS / WhatsApp gateway abstraction. Sends via Twilio when TWILIO_* env
 * vars are set (takes priority), via the WhatsApp Cloud API when WHATSAPP_*
 * vars are set, otherwise (dev) just logs the message. Callers only depend
 * on this interface.
 */
export const smsGateway = {
  async send({ to, message, channel = 'WHATSAPP' }) {
    if (channel === 'WHATSAPP' && twilioConfigured) {
      try {
        await sendViaTwilio(to, message);
        logger.info(`[WHATSAPP:twilio] sent to=${to}`);
        return { ok: true, provider: 'twilio' };
      } catch (e) {
        logger.error(`[WHATSAPP:twilio] send failed to=${to} :: ${e.message}`);
        return { ok: false, provider: 'twilio', error: e.message };
      }
    }
    if (channel === 'WHATSAPP' && waConfigured) {
      try {
        await sendViaWhatsAppCloud(to, message);
        logger.info(`[WHATSAPP:cloud-api] sent to=${to}`);
        return { ok: true, provider: 'whatsapp-cloud-api' };
      } catch (e) {
        logger.error(`[WHATSAPP] send failed to=${to} :: ${e.message}`);
        return { ok: false, provider: 'whatsapp-cloud-api', error: e.message };
      }
    }
    logger.info(`[${channel}] to=${to} :: ${message}`);
    return { ok: true, provider: 'dev-logger' };
  },
};

export const buildTransactionSms = ({ businessName, partyName, type, amount, balance }) => {
  const verb = type === 'GOT' ? 'made a payment of' : 'received credit of';
  return `${partyName} ${verb} ₹${amount} at ${businessName}. Current balance: ₹${balance}. — via FinBook`;
};

export const buildReminderMessage = ({ businessName, partyName, balance, dueDate }) =>
  `Dear ${partyName}, this is a payment reminder of ₹${balance} due to ${businessName}` +
  (dueDate ? ` by ${new Date(dueDate).toLocaleDateString('en-IN')}` : '') +
  `. Reply YES to confirm. — via FinBook`;

export const buildPartyWelcomeMessage = ({ businessName, partyName }) =>
  `Hi ${partyName}, ${businessName} has added you to their FinBook khata. You'll get updates here for entries and bills. — via FinBook`;

export const buildSaleConfirmationMessage = ({ businessName, partyName, invoiceNo, total }) =>
  `Hi ${partyName}, ${businessName} has billed you ₹${total} on invoice ${invoiceNo}. Reply YES to confirm. — via FinBook`;

export const buildInvoiceConfirmedAckMessage = ({ invoiceNo }) =>
  `Thanks! Invoice ${invoiceNo} is confirmed. — via FinBook`;

export const buildReminderConfirmedAckMessage = () =>
  `Thanks for confirming! — via FinBook`;
