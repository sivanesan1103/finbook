import prisma from '../../config/db.js';
import { ApiError } from '../../utils/apiError.js';
import { smsGateway, buildTransactionSms } from '../../utils/sms.js';

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
  totals.balance = balance;

  return { party, entries: filtered, totals };
};

export const createEntry = async ({ business, party, user, data }) => {
  const tx = await prisma.transaction.create({
    data: {
      ...data,
      businessId: business.id,
      partyId: party.id,
      createdById: user.id,
    },
  });

  // Cashbook auto-entry: money received (GOT) is cash-in, credit given (GAVE) is cash-out.
  await prisma.cashbookEntry.create({
    data: {
      businessId: business.id,
      direction: data.type === 'GOT' ? 'IN' : 'OUT',
      amount: data.amount,
      paymentMode: data.paymentMode || 'CASH',
      description: `${data.type === 'GOT' ? 'Payment from' : 'Credit to'} ${party.name}`,
      entryDate: data.entryDate || new Date(),
    },
  });

  // Transactional SMS (dev: logged only) when the party has SMS enabled.
  if (party.smsEnabled && party.phone) {
    const { totals } = await partyLedger(business.id, party.id);
    await smsGateway.send({
      to: party.phone,
      message: buildTransactionSms({
        businessName: business.name,
        partyName: party.name,
        type: data.type,
        amount: Number(data.amount),
        balance: Math.abs(totals.balance),
      }),
    });
    await prisma.transaction.update({ where: { id: tx.id }, data: { smsSent: true } });
    tx.smsSent = true;
  }
  return tx;
};
