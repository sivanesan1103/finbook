import prisma from '../../config/db.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiError } from '../../utils/apiError.js';
import { getPagination, paged } from '../../utils/pagination.js';
import { logActivity } from '../../middlewares/activity.js';
import { fileUrl } from '../../middlewares/upload.js';

const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });

export const list = asyncHandler(async (req, res) => {
  const { page, limit, skip, take } = getPagination(req.query);
  const where = {
    businessId: req.business.id,
    deletedAt: null,
    ...(req.query.category ? { category: req.query.category } : {}),
    ...(req.query.from || req.query.to
      ? { entryDate: { ...(req.query.from ? { gte: new Date(req.query.from) } : {}), ...(req.query.to ? { lte: new Date(req.query.to) } : {}) } }
      : {}),
  };
  const [rows, total, agg] = await Promise.all([
    prisma.expense.findMany({ where, orderBy: { entryDate: 'desc' }, skip, take }),
    prisma.expense.count({ where }),
    prisma.expense.aggregate({ where, _sum: { amount: true } }),
  ]);
  res.json({
    success: true,
    ...paged(rows, total, { page, limit }),
    summary: { totalAmount: Number(agg._sum.amount || 0) },
  });
});

/** Reusable expense items (Khatabook-style). Search with ?search= */
export const listItems = asyncHandler(async (req, res) => {
  const items = await prisma.expenseItem.findMany({
    where: {
      businessId: req.business.id,
      deletedAt: null,
      ...(req.query.search ? { name: { contains: req.query.search } } : {}),
    },
    orderBy: { name: 'asc' },
  });
  ok(res, items);
});

export const createItem = asyncHandler(async (req, res) => {
  const { name, price } = req.body;
  const clash = await prisma.expenseItem.findFirst({
    where: { businessId: req.business.id, name, deletedAt: null },
  });
  if (clash) throw ApiError.conflict('An expense item with this name already exists');
  const item = await prisma.expenseItem.create({
    data: { businessId: req.business.id, name, price },
  });
  logActivity(req, 'EXPENSE_ITEM_CREATED', 'ExpenseItem', item.id, { name });
  ok(res, item, 201);
});

export const deleteItem = asyncHandler(async (req, res) => {
  const { count } = await prisma.expenseItem.updateMany({
    where: { id: req.params.itemId, businessId: req.business.id, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  if (!count) throw ApiError.notFound('Expense item not found');
  ok(res, { deleted: true });
});

/** Category-wise totals for charts. */
export const byCategory = asyncHandler(async (req, res) => {
  const grouped = await prisma.expense.groupBy({
    by: ['category'],
    where: { businessId: req.business.id, deletedAt: null },
    _sum: { amount: true },
    _count: true,
  });
  ok(res, grouped.map((g) => ({ category: g.category, total: Number(g._sum.amount || 0), count: g._count })));
});

export const create = asyncHandler(async (req, res) => {
  // Expense + its mirrored cashbook entry are written atomically, and the
  // cashbook entry is linked back via expenseId so edits/deletes keep them
  // in sync (see update/softDelete below) — same pattern as ledger
  // transactions in transactions.service.js.
  const expense = await prisma.$transaction(async (txn) => {
    const created = await txn.expense.create({
      data: { ...req.body, businessId: req.business.id, attachment: fileUrl(req) },
    });
    await txn.cashbookEntry.create({
      data: {
        businessId: req.business.id,
        expenseId: created.id,
        direction: 'OUT',
        amount: created.amount,
        paymentMode: created.paymentMode,
        description: `Expense: ${created.category}`,
        entryDate: created.entryDate,
      },
    });
    return created;
  });
  logActivity(req, 'EXPENSE_CREATED', 'Expense', expense.id, {
    category: expense.category, amount: Number(expense.amount),
  });
  ok(res, expense, 201);
});

export const update = asyncHandler(async (req, res) => {
  const expense = await prisma.$transaction(async (txn) => {
    const existing = await txn.expense.findFirst({
      where: { id: req.params.expenseId, businessId: req.business.id, deletedAt: null },
    });
    if (!existing) throw ApiError.notFound('Expense not found');
    const data = { ...req.body, ...(req.file ? { attachment: fileUrl(req) } : {}) };
    const updated = await txn.expense.update({ where: { id: existing.id }, data });
    await txn.cashbookEntry.updateMany({
      where: { expenseId: existing.id, deletedAt: null },
      data: {
        amount: updated.amount,
        paymentMode: updated.paymentMode,
        entryDate: updated.entryDate,
        description: `Expense: ${updated.category}`,
      },
    });
    return updated;
  });
  ok(res, expense);
});

export const softDelete = asyncHandler(async (req, res) => {
  await prisma.$transaction(async (txn) => {
    const { count } = await txn.expense.updateMany({
      where: { id: req.params.expenseId, businessId: req.business.id, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (!count) throw ApiError.notFound('Expense not found');
    await txn.cashbookEntry.updateMany({
      where: { expenseId: req.params.expenseId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
  });
  logActivity(req, 'EXPENSE_DELETED', 'Expense', req.params.expenseId);
  ok(res, { deleted: true });
});
