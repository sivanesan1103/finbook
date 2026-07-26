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

// Party-facing message templates, in the sender's (business user's) app
// language — set via User.language, which the mobile/web language toggle
// syncs to the backend on change. These go out over WhatsApp/SMS deep
// links or (for the legacy auto-send paths) the SMS gateway, so the
// backend is the only place that can pick the language: neither channel
// carries a locale of its own.
const isTamil = (lang) => lang === 'ta';

export const buildTransactionSms = ({ businessName, partyName, type, amount, balance, lang }) => {
  if (isTamil(lang)) {
    const verb = type === 'GOT' ? 'செலுத்தினார்' : 'கடன் பெற்றார்';
    return `${partyName} ${businessName}-இல் ₹${amount} ${verb}. தற்போதைய இருப்பு: ₹${balance}. — FinBook மூலம்`;
  }
  const verb = type === 'GOT' ? 'made a payment of' : 'received credit of';
  return `${partyName} ${verb} ₹${amount} at ${businessName}. Current balance: ₹${balance}. — via FinBook`;
};

export const buildReminderMessage = ({ businessName, partyName, balance, dueDate, lang }) => {
  const dueDateStr = dueDate ? new Date(dueDate).toLocaleDateString('en-IN') : null;
  if (isTamil(lang)) {
    return `அன்புள்ள ${partyName}, ${businessName}-க்கு செலுத்த வேண்டிய ₹${balance} தொகைக்கான நினைவூட்டல் இது` +
      (dueDateStr ? `, ${dueDateStr}-க்குள் செலுத்தவும்` : '') +
      `. — FinBook மூலம்`;
  }
  return `Dear ${partyName}, this is a payment reminder of ₹${balance} due to ${businessName}` +
    (dueDateStr ? ` by ${dueDateStr}` : '') +
    `. — via FinBook`;
};

export const buildPartyWelcomeMessage = ({ businessName, partyName, lang }) => {
  if (isTamil(lang)) {
    return `வணக்கம் ${partyName}, ${businessName} உங்களை தங்கள் FinBook கணக்கில் சேர்த்துள்ளனர். பதிவுகள் மற்றும் பில்களுக்கான புதுப்பிப்புகளை இங்கே பெறுவீர்கள். — FinBook மூலம்`;
  }
  return `Hi ${partyName}, ${businessName} has added you to their FinBook khata. You'll get updates here for entries and bills. — via FinBook`;
};

export const buildSaleConfirmationMessage = ({ businessName, partyName, invoiceNo, total, lang }) => {
  if (isTamil(lang)) {
    return `வணக்கம் ${partyName}, ${businessName} உங்களுக்கு விலைப்பட்டியல் ${invoiceNo}-இல் ₹${total} கட்டணம் விதித்துள்ளனர். — FinBook மூலம்`;
  }
  return `Hi ${partyName}, ${businessName} has billed you ₹${total} on invoice ${invoiceNo}. — via FinBook`;
};

/** "New entry" share text with a public read-only link — the Khatabook-style
 * message users forward over WhatsApp/SMS after recording a transaction. */
export const buildEntryShareMessage = ({ businessName, amount, entryDate, balance, link, lang }) => {
  const dateStr = new Date(entryDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  if (isTamil(lang)) {
    return `${dateStr} இல் உள்ளீடுக்கான தொகை +₹${amount} சேர்க்கப்பட்டது.\n\n` +
      `மொத்த நிலுவைத் தொகை: ₹${balance}\n\n` +
      `பரிவர்த்தனை வரலாற்றைப் பார்க்க:\n${link}\n\n` +
      `நன்றி,\n${businessName}`;
  }
  return `₹${amount} has been added to your account entry for ${dateStr}.\n\n` +
    `Total outstanding balance: ₹${balance}\n\n` +
    `You can view the transaction history here:\n${link}\n\n` +
    `Thank you,\n${businessName}`;
};
