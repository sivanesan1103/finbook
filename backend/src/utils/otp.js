import bcrypt from 'bcryptjs';
import prisma from '../config/db.js';
import { ApiError } from './apiError.js';
import { mailer } from './mailer.js';

const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_ATTEMPTS = 5;

const generateCode = () => String(Math.floor(100000 + Math.random() * 900000));

/** Creates a fresh OTP for `email`, emails it, and stores its hash. */
export const issueOtp = async (email, purpose = 'VERIFY_EMAIL') => {
  const code = generateCode();
  const codeHash = await bcrypt.hash(code, 10);
  await prisma.emailOtp.create({
    data: { email, codeHash, purpose, expiresAt: new Date(Date.now() + OTP_TTL_MS) },
  });
  await mailer.send({
    to: email,
    subject: 'Your FinBook verification code',
    text: `Your FinBook verification code is ${code}. It expires in 10 minutes. If you didn't request this, ignore this email.`,
  });
  return { sent: true };
};

/** Verifies `code` against the most recent unconsumed OTP for `email`. */
export const verifyOtp = async (email, code, purpose = 'VERIFY_EMAIL') => {
  const otp = await prisma.emailOtp.findFirst({
    where: { email, purpose, consumedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  if (!otp) throw ApiError.badRequest('No verification code found — request a new one');
  if (otp.expiresAt < new Date()) throw ApiError.badRequest('Code expired — request a new one');
  if (otp.attempts >= MAX_ATTEMPTS) throw ApiError.badRequest('Too many attempts — request a new one');

  const ok = await bcrypt.compare(code, otp.codeHash);
  if (!ok) {
    await prisma.emailOtp.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
    throw ApiError.badRequest('Incorrect code');
  }
  await prisma.emailOtp.update({ where: { id: otp.id }, data: { consumedAt: new Date() } });
  return { verified: true };
};
