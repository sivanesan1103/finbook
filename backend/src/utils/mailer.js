import nodemailer from 'nodemailer';
import logger from '../config/logger.js';

const configured = !!(process.env.SMTP_USER && process.env.SMTP_PASS);

const transporter = configured
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: Number(process.env.SMTP_PORT || 587),
      secure: false,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    })
  : null;

/**
 * Email sender. In development (no SMTP_USER/SMTP_PASS set) this just logs
 * the message instead of sending — callers only depend on this interface.
 */
export const mailer = {
  async send({ to, subject, text }) {
    if (!transporter) {
      logger.info(`[EMAIL:dev-logger] to=${to} subject="${subject}" :: ${text}`);
      return { ok: true, provider: 'dev-logger' };
    }
    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject,
      text,
    });
    logger.info(`[EMAIL:smtp] sent to=${to} subject="${subject}"`);
    return { ok: true, provider: 'smtp' };
  },
};
