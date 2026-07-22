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

  if (sort === 'highest' || sort === 'lowest') {
    // Balance isn't a DB column — ranking by it requires every matching
    // party, not just the page the DB would otherwise return, or the sort
    // only ever reorders whatever page happened to load.
    const [allRows, total] = await Promise.all([
      prisma.party.findMany({ where }),
      prisma.party.count({ where }),
    ]);
    const balances = await computeBalances(businessId, allRows.map((p) => p.id));
    const ranked = allRows
      .map((p) => ({ ...p, balance: balances.get(p.id) || 0 }))
      .sort((a, b) => (sort === 'highest' ? Math.abs(b.balance) - Math.abs(a.balance) : Math.abs(a.balance) - Math.abs(b.balance)));
    return { parties: ranked.slice(skip, skip + take), total };
  }

  const [rows, total] = await Promise.all([
    prisma.party.findMany({ where, orderBy: sort === 'name' ? { name: 'asc' } : { updatedAt: 'desc' }, skip, take }),
    prisma.party.count({ where }),
  ]);
  const balances = await computeBalances(businessId, rows.map((p) => p.id));
  const parties = rows.map((p) => ({ ...p, balance: balances.get(p.id) || 0 }));
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
