/**
 * Prepares a message + the customer's phone number and hands off to
 * WhatsApp's deep link — the browser opens WhatsApp Web/desktop with the
 * chat and text already filled in, and the user taps send themselves. No
 * messaging API, no backend dispatch, no per-send cost or delivery failure
 * on our side. Web-only offers WhatsApp (not SMS) since there's no usable
 * native SMS app to hand off to from a desktop browser — mobile offers both.
 */

/** Digits-only phone number with country code, defaulting to India (91). */
const toIntlPhone = (phone: string) => {
  const digits = phone.replace(/[^\d]/g, '');
  return digits.length === 10 ? `91${digits}` : digits;
};

export const openWhatsApp = (phone: string, text: string) => {
  const url = `https://wa.me/${toIntlPhone(phone)}?text=${encodeURIComponent(text)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
};
