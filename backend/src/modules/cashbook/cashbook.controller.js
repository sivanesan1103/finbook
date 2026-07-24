import prisma from '../../config/db.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiError } from '../../utils/apiError.js';
import { getPagination, paged } from '../../utils/pagination.js';
import { logActivity } from '../../middlewares/activity.js';
import { streamCashbookReport } from '../../utils/pdf.js';
import { istDayStart, istDayEnd, istMonthStart } from '../../utils/istDate.js';

const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });

const dayRange = (dateStr) => {
  const d = dateStr ? new Date(dateStr) : new Date();
  return { start: istDayStart(d), end: istDayEnd(d) };
};

const buildWhere = (businessId, q) => {
  // `date` (single day) and `from`/`to` (range) both target entryDate — if a
  // caller ever sends both, a plain double-spread would let the second
  // silently clobber the first instead of being ignored or combined.
  let entryDate;
  if (q.date) entryDate = { gte: dayRange(q.date).start, lte: dayRange(q.date).end };
  else if (q.from || q.to) entryDate = { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lte: new Date(q.to) } : {}) };

  return {
    businessId,
    deletedAt: null,
    ...(q.paymentMode && q.paymentMode !== 'ALL' ? { paymentMode: q.paymentMode } : {}),
    ...(entryDate ? { entryDate } : {}),
  };
};

const sumByDirection = async (where) => {
  const grouped = await prisma.cashbookEntry.groupBy({
    by: ['direction'], where, _sum: { amount: true },
  });
  const totalIn = Number(grouped.find((g) => g.direction === 'IN')?._sum.amount || 0);
  const totalOut = Number(grouped.find((g) => g.direction === 'OUT')?._sum.amount || 0);
  return { in: totalIn, out: totalOut, balance: totalIn - totalOut };
};

export const list = asyncHandler(async (req, res) => {
  const { page, limit, skip, take } = getPagination(req.query);
  const where = buildWhere(req.business.id, req.query);
  const [rows, total] = await Promise.all([
    prisma.cashbookEntry.findMany({ where, orderBy: { entryDate: 'desc' }, skip, take }),
    prisma.cashbookEntry.count({ where }),
  ]);
  res.json({ success: true, ...paged(rows, total, { page, limit }) });
});

/** Header: total balance (all time) + today's balance. */
export const summary = asyncHandler(async (req, res) => {
  const allTime = await sumByDirection({ businessId: req.business.id, deletedAt: null });
  const { start, end } = dayRange();
  const today = await sumByDirection({
    businessId: req.business.id, deletedAt: null, entryDate: { gte: start, lte: end },
  });
  ok(res, { totalBalance: allTime.balance, todayBalance: today.balance, allTime, today });
});

export const create = asyncHandler(async (req, res) => {
  const entry = await prisma.cashbookEntry.create({
    data: { ...req.body, businessId: req.business.id },
  });
  logActivity(req, 'CASHBOOK_ENTRY_CREATED', 'CashbookEntry', entry.id, {
    direction: entry.direction, amount: Number(entry.amount),
  });
  ok(res, entry, 201);
});

// Entries mirrored from a ledger transaction (transactionId set) must only be
// edited/deleted via the transaction endpoints — otherwise the cashbook total
// and the party's ledger balance silently diverge.
const guardNotMirrored = async (entryId, businessId) => {
  const entry = await prisma.cashbookEntry.findFirst({
    where: { id: entryId, businessId, deletedAt: null },
  });
  if (!entry) throw ApiError.notFound('Entry not found');
  if (entry.transactionId) {
    throw ApiError.badRequest('This entry is linked to a ledger transaction — edit or delete it from the party ledger instead');
  }
  return entry;
};

export const update = asyncHandler(async (req, res) => {
  const entry = await guardNotMirrored(req.params.entryId, req.business.id);
  const updated = await prisma.cashbookEntry.update({ where: { id: entry.id }, data: req.body });
  ok(res, updated);
});

export const softDelete = asyncHandler(async (req, res) => {
  const entry = await guardNotMirrored(req.params.entryId, req.business.id);
  await prisma.cashbookEntry.update({ where: { id: entry.id }, data: { deletedAt: new Date() } });
  logActivity(req, 'CASHBOOK_ENTRY_DELETED', 'CashbookEntry', entry.id);
  ok(res, { deleted: true });
});

export const reportPdf = asyncHandler(async (req, res) => {
  const from = req.query.from ? new Date(req.query.from) : istMonthStart();
  const to = req.query.to ? new Date(req.query.to) : new Date();
  const where = { businessId: req.business.id, deletedAt: null, entryDate: { gte: from, lte: to } };
  const entries = await prisma.cashbookEntry.findMany({ where, orderBy: { entryDate: 'asc' } });
  const totals = await sumByDirection(where);
  streamCashbookReport(res, { business: req.business, entries, totals, from, to });
});
