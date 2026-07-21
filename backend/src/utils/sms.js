import logger from '../config/logger.js';

const waConfigured = !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);

/** Digits-only phone number with country code, defaulting to India (91). */
const toWhatsAppNumber = (phone) => {
  const digits = phone.replace(/[^\d]/g, '');
  return digits.length === 10 ? `91${digits}` : digits;
};

const sendWhatsApp = async (to, message) => {
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
 * SMS / WhatsApp gateway abstraction. Sends via the WhatsApp Cloud API when
 * WHATSAPP_TOKEN + WHATSAPP_PHONE_NUMBER_ID are set; otherwise (dev) just
 * logs the message. Callers only depend on this interface.
 */
export const smsGateway = {
  async send({ to, message, channel = 'WHATSAPP' }) {
    if (channel === 'WHATSAPP' && waConfigured) {
      try {
        await sendWhatsApp(to, message);
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
  `. — via FinBook`;

export const buildPartyWelcomeMessage = ({ businessName, partyName }) =>
  `Hi ${partyName}, ${businessName} has added you to their FinBook khata. You'll get updates here for entries and bills. — via FinBook`;

export const buildSaleConfirmationMessage = ({ businessName, partyName, invoiceNo, total }) =>
  `Hi ${partyName}, ${businessName} has billed you ₹${total} on invoice ${invoiceNo}. — via FinBook`;
