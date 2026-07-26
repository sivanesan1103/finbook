import prisma from '../../config/db.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiError } from '../../utils/apiError.js';
import { verifyEntryToken } from '../../utils/shareToken.js';
import { partyLedger } from '../transactions/transactions.service.js';

// Public pages are read-only receipts, not a full account export — cap how
// much history a single link can expose even for a very long-running party.
const MAX_ENTRIES = 50;

/**
 * Unauthenticated read-only ledger view for the link shared over
 * WhatsApp/SMS (see transactions.controller.js#shareLink) — same shape as
 * Khatabook's own "view transaction history" page: business name, a
 * debit/credit/balance summary, and the party's recent entries with the
 * shared one flagged as latest. Only ever returns the fields a customer
 * needs to see — never party/business ids or anything else in the ledger.
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
  const totals = entries.reduce(
    (acc, e) => {
      if (e.type === 'GAVE') acc.debit += e.amount;
      else acc.credit += e.amount;
      return acc;
    },
    { debit: 0, credit: 0 }
  );
  const netBalance = entries.length ? entries[entries.length - 1].runningBalance : 0;

  // Newest first, matching how the reference page presents it.
  const recent = [...entries].reverse().slice(0, MAX_ENTRIES);

  res.json({
    success: true,
    data: {
      businessName: tx.business.name,
      partyName: tx.party.name,
      totalDebit: totals.debit,
      totalCredit: totals.credit,
      netBalance,
      entries: recent.map((e) => ({
        id: e.id,
        entryDate: e.entryDate,
        debit: e.type === 'GAVE' ? e.amount : null,
        credit: e.type === 'GOT' ? e.amount : null,
        balance: e.runningBalance,
        isLatest: e.id === entryId,
      })),
    },
  });
});
