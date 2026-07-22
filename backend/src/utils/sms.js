import logger from '../config/logger.js';

const twilioConfigured = !!(
  process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_SMS_FROM
);

/** Digits-only phone number with country code, defaulting to India (91). */
const toIntlNumber = (phone) => {
  const digits = phone.replace(/[^\d]/g, '');
  return digits.length === 10 ? `91${digits}` : digits;
};

const sendViaTwilio = async (to, message) => {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
  const body = new URLSearchParams({
    From: `+${process.env.TWILIO_SMS_FROM.replace(/[^\d]/g, '')}`,
    To: `+${toIntlNumber(to)}`,
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

/**
 * SMS gateway abstraction. Sends via Twilio when TWILIO_* env vars are set,
 * otherwise (dev) just logs the message. Callers only depend on this interface.
 */
export const smsGateway = {
  async send({ to, message }) {
    if (twilioConfigured) {
      try {
        await sendViaTwilio(to, message);
        logger.info(`[SMS:twilio] sent to=${to}`);
        return { ok: true, provider: 'twilio' };
      } catch (e) {
        logger.error(`[SMS:twilio] send failed to=${to} :: ${e.message}`);
        return { ok: false, provider: 'twilio', error: e.message };
      }
    }
    logger.info(`[SMS] to=${to} :: ${message}`);
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
  `. — via FinBook`;

export const buildPartyWelcomeMessage = ({ businessName, partyName }) =>
  `Hi ${partyName}, ${businessName} has added you to their FinBook khata. You'll get updates here for entries and bills. — via FinBook`;

export const buildSaleConfirmationMessage = ({ businessName, partyName, invoiceNo, total }) =>
  `Hi ${partyName}, ${businessName} has billed you ₹${total} on invoice ${invoiceNo}. — via FinBook`;
