import { z } from 'zod';

// Shared by parties.routes.js (single-create validation) and
// parties.controller.js (per-row validation in bulkCreate) — kept in its
// own module rather than imported cross-file to avoid a routes/controller
// circular import.
export const partyBody = z.object({
  type: z.enum(['CUSTOMER', 'SUPPLIER']).default('CUSTOMER'),
  name: z.string().min(1).max(120),
  phone: z.string().trim().regex(/^\+?[0-9][0-9\s-]{6,19}$/, 'Enter a valid phone number').optional().or(z.literal('')),
  email: z.string().email().optional(),
  gstin: z.string().max(20).optional(),
  addressLine: z.string().max(200).optional(),
  area: z.string().max(100).optional(),
  city: z.string().max(80).optional(),
  state: z.string().max(80).optional(),
  pincode: z.string().max(10).optional(),
  smsEnabled: z.boolean().optional(),
});
