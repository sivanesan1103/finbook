import prisma from '../../config/db.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { computeBalances } from '../parties/parties.service.js';
import { streamTransactionsReport, streamSalesReport } from '../../utils/pdf.js';

const ok = (res, data) => res.json({ success: true, data });

const rangeFromQuery = (q) => {
  const to = q.to ? new Date(q.to) : new Date();
  // A date-only `to` (e.g. "2026-07-21") parses as midnight, which would
  // silently exclude every record dated on that day from `lte: to` filters.
  if (q.to) to.setHours(23, 59, 59, 999);
  const from = q.from ? new Date(q.from) : new Date(to.getFullYear(), to.getMonth(), 1);
  return { from, to };
};

/** Dashboard: headline numbers for the current book. */
export const dashboard = asyncHandler(async (req, res) => {
  const businessId = req.business.id;
  const { from, to } = rangeFromQuery(req.query);

  const [txAgg, cashAgg, expenseAgg, invoiceAgg, partyCounts, recent] = await Promise.all([
    prisma.transaction.groupBy({
      by: ['type'],
      where: { businessId, deletedAt: null, entryDate: { gte: from, lte: to } },
      _sum: { amount: true },
    }),
    prisma.cashbookEntry.groupBy({
      by: ['direction'],
      where: { businessId, deletedAt: null, entryDate: { gte: from, lte: to } },
      _sum: { amount: true },
    }),
    prisma.expense.aggregate({
      where: { businessId, deletedAt: null, entryDate: { gte: from, lte: to } },
      _sum: { amount: true },
    }),
    prisma.invoice.aggregate({
      where: { businessId, deletedAt: null, issueDate: { gte: from, lte: to } },
      _sum: { total: true, amountPaid: true },
      _count: true,
    }),
    prisma.party.groupBy({
      by: ['type'],
      where: { businessId, deletedAt: null },
      _count: true,
    }),
    prisma.transaction.findMany({
      where: { businessId, deletedAt: null },
      include: { party: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 8,
    }),
  ]);

  const balances = await computeBalances(businessId);
  let youWillGet = 0, youWillGive = 0;
  for (const b of balances.values()) (b > 0 ? (youWillGet += b) : (youWillGive += -b));

  ok(res, {
    range: { from, to },
    ledger: {
      gave: Number(txAgg.find((t) => t.type === 'GAVE')?._sum.amount || 0),
      got: Number(txAgg.find((t) => t.type === 'GOT')?._sum.amount || 0),
      youWillGet,
      youWillGive,
    },
    cash: {
      in: Number(cashAgg.find((c) => c.direction === 'IN')?._sum.amount || 0),
      out: Number(cashAgg.find((c) => c.direction === 'OUT')?._sum.amount || 0),
    },
    expenses: Number(expenseAgg._sum.amount || 0),
    sales: {
      invoiceCount: invoiceAgg._count,
      billed: Number(invoiceAgg._sum.total || 0),
      collected: Number(invoiceAgg._sum.amountPaid || 0),
    },
    parties: {
      customers: partyCounts.find((p) => p.type === 'CUSTOMER')?._count || 0,
      suppliers: partyCounts.find((p) => p.type === 'SUPPLIER')?._count || 0,
    },
    recentTransactions: recent.map((t) => ({ ...t, amount: Number(t.amount) })),
  });
});

/** Transactions report: all entries in range filtered by party type. */
export const transactionsReport = asyncHandler(async (req, res) => {
  const { from, to } = rangeFromQuery(req.query);
  const where = {
    businessId: req.business.id,
    deletedAt: null,
    entryDate: { gte: from, lte: to },
    ...(req.query.partyType ? { party: { type: req.query.partyType } } : {}),
    ...(req.query.search ? { party: { name: { contains: req.query.search } } } : {}),
  };
  const entries = await prisma.transaction.findMany({
    where,
    include: { party: { select: { id: true, name: true, type: true } } },
    orderBy: { entryDate: 'desc' },
  });
  const totals = entries.reduce(
    (acc, t) => {
      if (t.type === 'GAVE') acc.gave += Number(t.amount);
      else acc.got += Number(t.amount);
      return acc;
    },
    { gave: 0, got: 0 }
  );
  totals.net = totals.got - totals.gave;
  ok(res, { range: { from, to }, totals, count: entries.length, entries });
});

/** Transactions report as a downloadable PDF. */
export const transactionsReportPdf = asyncHandler(async (req, res) => {
  const { from, to } = rangeFromQuery(req.query);
  const where = {
    businessId: req.business.id,
    deletedAt: null,
    entryDate: { gte: from, lte: to },
    ...(req.query.partyType ? { party: { type: req.query.partyType } } : {}),
    ...(req.query.search ? { party: { name: { contains: req.query.search } } } : {}),
  };
  const entries = await prisma.transaction.findMany({
    where,
    include: { party: { select: { id: true, name: true, type: true } } },
    orderBy: { entryDate: 'desc' },
  });
  const totals = entries.reduce(
    (acc, t) => {
      if (t.type === 'GAVE') acc.gave += Number(t.amount);
      else acc.got += Number(t.amount);
      return acc;
    },
    { gave: 0, got: 0 }
  );
  totals.net = totals.got - totals.gave;
  streamTransactionsReport(res, {
    business: req.business, entries, totals, from, to, partyType: req.query.partyType,
  });
});

/** Sales report: invoices in range with details. */
export const salesReport = asyncHandler(async (req, res) => {
  const { from, to } = rangeFromQuery(req.query);
  const where = {
    businessId: req.business.id,
    deletedAt: null,
    issueDate: { gte: from, lte: to },
    ...(req.query.partyId ? { partyId: req.query.partyId } : {}),
    ...(req.query.search ? { invoiceNo: { contains: req.query.search } } : {}),
  };
  const [invoices, agg] = await Promise.all([
    prisma.invoice.findMany({
      where,
      include: {
        party: { select: { id: true, name: true, type: true } },
        items: { select: { name: true, qty: true, price: true, amount: true } },
        payments: { select: { amount: true, mode: true, paidAt: true } },
      },
      orderBy: { issueDate: 'desc' },
    }),
    prisma.invoice.aggregate({
      where,
      _sum: { total: true, amountPaid: true },
      _count: true,
    }),
  ]);

  const rows = invoices.map((inv) => ({
    id: inv.id,
    invoiceNo: inv.invoiceNo,
    date: inv.issueDate,
    partyName: inv.party.name,
    partyType: inv.party.type,
    status: inv.status,
    subtotal: Number(inv.subtotal),
    tax: Number(inv.taxAmount),
    discount: Number(inv.discount),
    total: Number(inv.total),
    paid: Number(inv.amountPaid),
    balance: Number(inv.total) - Number(inv.amountPaid),
    itemCount: inv.items.length,
    payments: inv.payments.map((p) => ({
      amount: Number(p.amount),
      mode: p.mode,
      paidAt: p.paidAt,
    })),
  }));

  const totals = {
    count: agg._count,
    billed: Number(agg._sum.total || 0),
    collected: Number(agg._sum.amountPaid || 0),
    pending: Number((agg._sum.total || 0) - (agg._sum.amountPaid || 0)),
  };

  ok(res, { range: { from, to }, totals, entries: rows });
});

/** Sales report as a downloadable PDF. */
export const salesReportPdf = asyncHandler(async (req, res) => {
  const { from, to } = rangeFromQuery(req.query);
  const where = {
    businessId: req.business.id,
    deletedAt: null,
    issueDate: { gte: from, lte: to },
    ...(req.query.partyId ? { partyId: req.query.partyId } : {}),
  };
  const [invoices, agg] = await Promise.all([
    prisma.invoice.findMany({
      where,
      include: { party: { select: { name: true, type: true } } },
      orderBy: { issueDate: 'desc' },
    }),
    prisma.invoice.aggregate({ where, _sum: { total: true, amountPaid: true }, _count: true }),
  ]);

  const rows = invoices.map((inv) => ({
    invoiceNo: inv.invoiceNo,
    date: inv.issueDate,
    partyName: inv.party.name,
    status: inv.status,
    total: Number(inv.total),
    balance: Number(inv.total) - Number(inv.amountPaid),
  }));
  const totals = {
    count: agg._count,
    billed: Number(agg._sum.total || 0),
    collected: Number(agg._sum.amountPaid || 0),
    pending: Number((agg._sum.total || 0) - (agg._sum.amountPaid || 0)),
  };

  streamSalesReport(res, { business: req.business, entries: rows, totals, from, to });
});

/** Purchases report: transactions with SUPPLIER parties in range. */
export const purchasesReport = asyncHandler(async (req, res) => {
  const { from, to } = rangeFromQuery(req.query);
  const where = {
    businessId: req.business.id,
    deletedAt: null,
    entryDate: { gte: from, lte: to },
    party: { type: 'SUPPLIER' },
    ...(req.query.search ? { party: { name: { contains: req.query.search } } } : {}),
  };
  const entries = await prisma.transaction.findMany({
    where,
    include: { party: { select: { id: true, name: true, type: true } } },
    orderBy: { entryDate: 'desc' },
  });

  const totals = entries.reduce(
    (acc, t) => {
      if (t.type === 'GAVE') { acc.gave += Number(t.amount); acc.gaveCount++; }
      else { acc.got += Number(t.amount); acc.gotCount++; }
      return acc;
    },
    { gave: 0, got: 0, gaveCount: 0, gotCount: 0 }
  );
  totals.net = totals.got - totals.gave;
  totals.count = entries.length;

  ok(res, { range: { from, to }, totals, entries });
});

/** Parties index: summary of all parties with balances. */
export const partiesSummary = asyncHandler(async (req, res) => {
  const businessId = req.business.id;
  const { type } = req.query;
  const where = {
    businessId,
    deletedAt: null,
    ...(type ? { type } : {}),
  };
  const parties = await prisma.party.findMany({
    where,
    select: {
      id: true,
      name: true,
      type: true,
      phone: true,
      city: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { name: 'asc' },
  });

  // balance = GAVE − GOT (same convention as computeBalances everywhere else
  // in the app); positive means the party owes you ("you will get").
  const balances = await computeBalances(businessId, parties.map((p) => p.id));
  let totalReceivable = 0;
  let totalPayable = 0;
  for (const p of parties) {
    const bal = balances.get(p.id) || 0;
    if (bal >= 0) totalReceivable += bal;
    else totalPayable += -bal;
  }

  ok(res, { parties, totals: { count: parties.length, totalReceivable, totalPayable } });
});
