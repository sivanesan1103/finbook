import prisma from '../../config/db.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiError } from '../../utils/apiError.js';
import { verifyEntryToken } from '../../utils/shareToken.js';
import { partyLedger } from '../transactions/transactions.service.js';

/**
 * Unauthenticated read-only view of a single ledger entry, for the link
 * shared over WhatsApp/SMS (see transactions.controller.js#shareLink). Only
 * returns the handful of fields a customer actually needs to see — never
 * the party/business id, other entries, or anything else in the ledger.
 */
export const getEntry = asyncHandler(async (req, res) => {
  const entryId = verifyEntryToken(req.params.token);
  if (!entryId) throw ApiError.notFound('Link not found or expired');

  const tx = await prisma.transaction.findFirst({
    where: { id: entryId, deletedAt: null },
    include: { party: true, business: { select: { name: true, deletedAt: true } } },
  });
  if (!tx || tx.party.deletedAt || tx.business.deletedAt) {
    throw ApiError.notFound('Link not found or expired');
  }

  const { entries } = await partyLedger(tx.businessId, tx.partyId, {});
  const withBalance = entries.find((e) => e.id === entryId);

  res.json({
    success: true,
    data: {
      businessName: tx.business.name,
      partyName: tx.party.name,
      amount: Number(tx.amount),
      type: tx.type,
      entryDate: tx.entryDate,
      runningBalance: withBalance ? withBalance.runningBalance : null,
    },
  });
});
