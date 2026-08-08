import { z } from 'zod';

/** Largest value that fits the Decimal(12,2) money columns in schema.prisma. */
export const MAX_MONEY = 99_999_999;

/**
 * A rupee amount that is still valid *after* it lands in Decimal(12,2).
 *
 * `z.coerce.number().positive()` on its own accepted 0.001 — MySQL then
 * rounded it to 0.00 and stored a zero-value ledger entry, quietly defeating
 * the "amount must be greater than zero" rule the validator existed to
 * enforce. Rounding to paise *before* the range check makes it honest, and
 * has the side benefit that 10.555 is stored as the same 10.56 the API
 * reports back rather than differing by rounding mode.
 */
export const moneyAmount = z.coerce
  .number()
  .refine(Number.isFinite, { message: 'must be a valid number' })
  .transform((n) => Math.round(n * 100) / 100)
  .refine((n) => n >= 0.01, { message: 'must be at least 0.01' })
  .refine((n) => n <= MAX_MONEY, { message: `must be at most ${MAX_MONEY}` });

/** Same rounding, but allows zero — for optional/settlement amounts. */
export const moneyAmountOrZero = z.coerce
  .number()
  .refine(Number.isFinite, { message: 'must be a valid number' })
  .transform((n) => Math.round(n * 100) / 100)
  .refine((n) => n >= 0, { message: 'cannot be negative' })
  .refine((n) => n <= MAX_MONEY, { message: `must be at most ${MAX_MONEY}` });
