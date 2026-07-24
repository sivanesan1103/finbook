import prisma from '../../config/db.js';
import { ApiError } from '../../utils/apiError.js';

/** Ledger entries for a party, oldest first, with running balance attached. */
export const partyLedger = async (businessId, partyId, { from, to, type, search } = {}) => {
  const party = await prisma.party.findFirst({ where: { id: partyId, businessId, deletedAt: null } });
  if (!party) throw ApiError.notFound('Party not found');

  const all = await prisma.transaction.findMany({
    where: { businessId, partyId, deletedAt: null },
    orderBy: [{ entryDate: 'asc' }, { createdAt: 'asc' }],
  });

  let balance = 0;
  const withBalance = all.map((t) => {
    balance += t.type === 'GAVE' ? Number(t.amount) : -Number(t.amount);
    return { ...t, amount: Number(t.amount), runningBalance: balance };
  });

  const filtered = withBalance.filter((t) => {
    if (from && t.entryDate < new Date(from)) return false;
    if (to && t.entryDate > new Date(to)) return false;
    if (type && t.type !== type) return false;
    if (search && !(t.description || '').toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const totals = filtered.reduce(
    (acc, t) => {
      if (t.type === 'GAVE') acc.gave += t.amount;
      else acc.got += t.amount;
      return acc;
    },
    { gave: 0, got: 0 }
  );
  // Net balance of the *filtered* range, so it reconciles with gave/got as
  // displayed together (statement PDF, ledger header). Each entry's own
  // `runningBalance` above is still the true all-time cumulative balance.
  totals.balance = totals.gave - totals.got;

  return { party, entries: filtered, totals };
};

export const createEntry = async ({ business, party, user, data }) => {
  // Transaction + its mirrored cashbook entry are written atomically, and the
  // cashbook entry is linked back via transactionId so edits/deletes can keep
  // them in sync (see updateEntry/deleteEntry below).
  const tx = await prisma.$transaction(async (txn) => {
    const created = await txn.transaction.create({
      data: {
        ...data,
        businessId: business.id,
        partyId: party.id,
        createdById: user.id,
      },
    });
    // Cashbook auto-entry: money received (GOT) is cash-in, credit given (GAVE) is cash-out.
    await txn.cashbookEntry.create({
      data: {
        businessId: business.id,
        transactionId: created.id,
        direction: data.type === 'GOT' ? 'IN' : 'OUT',
        amount: data.amount,
        paymentMode: data.paymentMode || 'CASH',
        description: `${data.type === 'GOT' ? 'Payment from' : 'Credit to'} ${party.name}`,
        entryDate: data.entryDate || new Date(),
      },
    });
    return created;
  });

  return tx;
};

/** Updates a transaction and keeps its mirrored cashbook entry (direction/amount/etc) in sync. */
export const updateEntry = async (businessId, txId, patch) => {
  return prisma.$transaction(async (txn) => {
    const existing = await txn.transaction.findFirst({
      where: { id: txId, businessId, deletedAt: null },
      include: { party: true },
    });
    if (!existing) throw ApiError.notFound('Transaction not found');
    const updated = await txn.transaction.update({ where: { id: txId }, data: patch });

    const type = patch.type ?? existing.type;
    await txn.cashbookEntry.updateMany({
      where: { transactionId: txId, deletedAt: null },
      data: {
        direction: type === 'GOT' ? 'IN' : 'OUT',
        amount: patch.amount ?? existing.amount,
        paymentMode: patch.paymentMode ?? existing.paymentMode,
        entryDate: patch.entryDate ?? existing.entryDate,
        description: `${type === 'GOT' ? 'Payment from' : 'Credit to'} ${existing.party.name}`,
      },
    });
    return updated;
  });
};

/** Soft-deletes a transaction and its mirrored cashbook entry together. */
export const deleteEntry = async (businessId, txId) => {
  return prisma.$transaction(async (txn) => {
    const { count } = await txn.transaction.updateMany({
      where: { id: txId, businessId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (!count) throw ApiError.notFound('Transaction not found');
    await txn.cashbookEntry.updateMany({
      where: { transactionId: txId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
  });
};
