import prisma from '../../config/db.js';

/**
 * Balance convention (matches the khata UX):
 *   balance = Σ GAVE − Σ GOT
 *   balance > 0 → party owes you  → "You will get"
 *   balance < 0 → you owe party   → "You will give"
 */
export const computeBalances = async (businessId, partyIds) => {
  const grouped = await prisma.transaction.groupBy({
    by: ['partyId', 'type'],
    where: { businessId, deletedAt: null, ...(partyIds ? { partyId: { in: partyIds } } : {}) },
    _sum: { amount: true },
  });
  const map = new Map();
  for (const g of grouped) {
    const cur = map.get(g.partyId) || 0;
    const amt = Number(g._sum.amount || 0);
    map.set(g.partyId, g.type === 'GAVE' ? cur + amt : cur - amt);
  }
  return map;
};

export const listParties = async (businessId, { type, search, sort, skip, take }) => {
  const where = {
    businessId,
    deletedAt: null,
    ...(type ? { type } : {}),
    ...(search
      ? { OR: [{ name: { contains: search } }, { phone: { contains: search } }] }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.party.findMany({ where, orderBy: sort === 'name' ? { name: 'asc' } : { updatedAt: 'desc' }, skip, take }),
    prisma.party.count({ where }),
  ]);

  const balances = await computeBalances(businessId, rows.map((p) => p.id));
  let parties = rows.map((p) => ({ ...p, balance: balances.get(p.id) || 0 }));
  if (sort === 'highest') parties = parties.sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));
  if (sort === 'lowest') parties = parties.sort((a, b) => Math.abs(a.balance) - Math.abs(b.balance));
  return { parties, total };
};

/** "You will give / You will get" header totals for a party type tab. */
export const summary = async (businessId, type) => {
  const partyIds = (
    await prisma.party.findMany({ where: { businessId, deletedAt: null, ...(type ? { type } : {}) }, select: { id: true } })
  ).map((p) => p.id);
  const balances = await computeBalances(businessId, partyIds);
  let youWillGet = 0;
  let youWillGive = 0;
  for (const b of balances.values()) {
    if (b > 0) youWillGet += b;
    else youWillGive += -b;
  }
  return { youWillGet, youWillGive, partyCount: partyIds.length };
};
