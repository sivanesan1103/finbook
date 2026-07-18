import logger from '../config/logger.js';

/**
 * SMS / WhatsApp gateway abstraction.
 * In development the message is just logged. To go live, implement `send`
 * with your provider (Twilio, MSG91, Gupshup, WhatsApp Cloud API…) —
 * callers only depend on this interface.
 */
export const smsGateway = {
  async send({ to, message, channel = 'SMS' }) {
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
