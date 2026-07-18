import prisma from '../../config/db.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiError } from '../../utils/apiError.js';
import { logActivity } from '../../middlewares/activity.js';

const EXPORT_VERSION = 1;

const pick = (obj, keys) => {
  const out = {};
  for (const k of keys) if (obj[k] !== undefined && obj[k] !== null) out[k] = obj[k];
  return out;
};

const PARTY_FIELDS = ['type', 'name', 'phone', 'email', 'gstin', 'addressLine', 'area', 'city', 'state', 'pincode', 'smsEnabled'];
const TX_FIELDS = ['type', 'amount', 'description', 'paymentMode', 'entryDate', 'smsSent'];
const CASH_FIELDS = ['direction', 'amount', 'paymentMode', 'description', 'entryDate'];
const EXPENSE_FIELDS = ['category', 'amount', 'notes', 'paymentMode', 'entryDate'];
const EXPENSE_ITEM_FIELDS = ['name', 'price'];
const ITEM_FIELDS = ['name', 'sku', 'unit', 'salePrice', 'purchasePrice', 'taxRate', 'stockQty', 'lowStockAlert'];
const INVOICE_FIELDS = ['invoiceNo', 'docType', 'status', 'issueDate', 'dueDate', 'subtotal', 'taxAmount', 'discount', 'total', 'amountPaid', 'notes'];
const INVOICE_ITEM_FIELDS = ['name', 'qty', 'price', 'taxRate', 'amount'];
const PAYMENT_FIELDS = ['amount', 'mode', 'note', 'paidAt'];

/** GET /businesses/:id/export — full JSON backup of the current book. */
export const exportData = asyncHandler(async (req, res) => {
  const where = { businessId: req.business.id, deletedAt: null };
  const [parties, transactions, cashbookEntries, expenses, expenseItems, items, invoices] = await Promise.all([
    prisma.party.findMany({ where, orderBy: { createdAt: 'asc' } }),
    prisma.transaction.findMany({ where, orderBy: { entryDate: 'asc' } }),
    prisma.cashbookEntry.findMany({ where, orderBy: { entryDate: 'asc' } }),
    prisma.expense.findMany({ where, orderBy: { entryDate: 'asc' } }),
    prisma.expenseItem.findMany({ where, orderBy: { name: 'asc' } }),
    prisma.item.findMany({ where, orderBy: { name: 'asc' } }),
    prisma.invoice.findMany({
      where,
      include: { items: true, payments: true },
      orderBy: { issueDate: 'asc' },
    }),
  ]);

  const b = req.business;
  res.setHeader('Content-Disposition', `attachment; filename="finbook-backup-${new Date().toISOString().slice(0, 10)}.json"`);
  res.json({
    app: 'FinBook',
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    business: pick(b, ['name', 'phone', 'email', 'address', 'gstin', 'category', 'currency',
      'upiId', 'bankName', 'bankAccountName', 'bankAccountNo', 'bankIfsc', 'invoiceTerms']),
    data: {
      parties: parties.map((p) => ({ ...pick(p, PARTY_FIELDS), _id: p.id })),
      transactions: transactions.map((t) => ({ ...pick(t, TX_FIELDS), _partyId: t.partyId })),
      cashbookEntries: cashbookEntries.map((c) => pick(c, CASH_FIELDS)),
      expenses: expenses.map((e) => pick(e, EXPENSE_FIELDS)),
      expenseItems: expenseItems.map((e) => pick(e, EXPENSE_ITEM_FIELDS)),
      items: items.map((i) => ({ ...pick(i, ITEM_FIELDS), _id: i.id })),
      invoices: invoices.map((inv) => ({
        ...pick(inv, INVOICE_FIELDS),
        _partyId: inv.partyId,
        items: inv.items.map((it) => ({ ...pick(it, INVOICE_ITEM_FIELDS), _itemId: it.itemId })),
        payments: inv.payments.map((p) => pick(p, PAYMENT_FIELDS)),
      })),
    },
  });
});

/**
 * POST /businesses/:id/import — restore a FinBook backup into the current book.
 * Additive: parties/items/expense-items are matched by natural keys and reused;
 * ledger entries are appended; invoices with an existing invoiceNo are skipped.
 */
export const importData = asyncHandler(async (req, res) => {
  const body = req.body || {};
  if (body.app !== 'FinBook' || !body.data || typeof body.data !== 'object') {
    throw ApiError.badRequest('Not a FinBook backup file');
  }
  if (Number(body.version) > EXPORT_VERSION) {
    throw ApiError.badRequest(`Backup version ${body.version} is newer than this server supports`);
  }
  const d = body.data;
  const arr = (x) => (Array.isArray(x) ? x : []);
  const businessId = req.business.id;

  const summary = {
    parties: { created: 0, reused: 0 },
    items: { created: 0, skipped: 0 },
    expenseItems: { created: 0, skipped: 0 },
    transactions: { created: 0, skipped: 0 },
    cashbookEntries: { created: 0 },
    expenses: { created: 0 },
    invoices: { created: 0, skipped: 0 },
  };

  await prisma.$transaction(async (tx) => {
    // Parties — reuse by (type, name, phone), remember old-id → new-id
    const partyMap = new Map();
    const existingParties = await tx.party.findMany({ where: { businessId, deletedAt: null } });
    const partyKey = (p) => `${p.type}|${(p.name || '').trim().toLowerCase()}|${p.phone || ''}`;
    const byKey = new Map(existingParties.map((p) => [partyKey(p), p.id]));
    for (const raw of arr(d.parties)) {
      const data = pick(raw, PARTY_FIELDS);
      if (!data.name) continue;
      const key = partyKey(data);
      if (byKey.has(key)) {
        partyMap.set(raw._id, byKey.get(key));
        summary.parties.reused++;
      } else {
        const created = await tx.party.create({ data: { ...data, businessId } });
        byKey.set(key, created.id);
        partyMap.set(raw._id, created.id);
        summary.parties.created++;
      }
    }

    // Items — skip existing names (unique per business)
    const itemMap = new Map();
    const existingItems = await tx.item.findMany({ where: { businessId, deletedAt: null } });
    const itemByName = new Map(existingItems.map((i) => [i.name.toLowerCase(), i.id]));
    for (const raw of arr(d.items)) {
      const data = pick(raw, ITEM_FIELDS);
      if (!data.name || data.salePrice === undefined) continue;
      const key = data.name.toLowerCase();
      if (itemByName.has(key)) {
        itemMap.set(raw._id, itemByName.get(key));
        summary.items.skipped++;
      } else {
        const created = await tx.item.create({ data: { ...data, businessId } });
        itemByName.set(key, created.id);
        itemMap.set(raw._id, created.id);
        summary.items.created++;
      }
    }

    // Expense items — skip existing names
    const existingExpItems = await tx.expenseItem.findMany({ where: { businessId, deletedAt: null } });
    const expItemNames = new Set(existingExpItems.map((i) => i.name.toLowerCase()));
    for (const raw of arr(d.expenseItems)) {
      const data = pick(raw, EXPENSE_ITEM_FIELDS);
      if (!data.name) continue;
      if (expItemNames.has(data.name.toLowerCase())) { summary.expenseItems.skipped++; continue; }
      await tx.expenseItem.create({ data: { ...data, businessId } });
      expItemNames.add(data.name.toLowerCase());
      summary.expenseItems.created++;
    }

    // Party ledger transactions
    for (const raw of arr(d.transactions)) {
      const partyId = partyMap.get(raw._partyId);
      const data = pick(raw, TX_FIELDS);
      if (!partyId || !data.type || data.amount === undefined) { summary.transactions.skipped++; continue; }
      await tx.transaction.create({ data: { ...data, businessId, partyId } });
      summary.transactions.created++;
    }

    // Cashbook
    for (const raw of arr(d.cashbookEntries)) {
      const data = pick(raw, CASH_FIELDS);
      if (!data.direction || data.amount === undefined) continue;
      await tx.cashbookEntry.create({ data: { ...data, businessId } });
      summary.cashbookEntries.created++;
    }

    // Expenses
    for (const raw of arr(d.expenses)) {
      const data = pick(raw, EXPENSE_FIELDS);
      if (data.amount === undefined) continue;
      await tx.expense.create({ data: { ...data, businessId } });
      summary.expenses.created++;
    }

    // Invoices — skip when invoiceNo already exists
    const existingInvoices = await tx.invoice.findMany({ where: { businessId }, select: { invoiceNo: true } });
    const invoiceNos = new Set(existingInvoices.map((i) => i.invoiceNo));
    for (const raw of arr(d.invoices)) {
      const data = pick(raw, INVOICE_FIELDS);
      const partyId = partyMap.get(raw._partyId);
      if (!data.invoiceNo || !partyId || data.total === undefined) { summary.invoices.skipped++; continue; }
      if (invoiceNos.has(data.invoiceNo)) { summary.invoices.skipped++; continue; }
      await tx.invoice.create({
        data: {
          ...data,
          businessId,
          partyId,
          items: {
            create: arr(raw.items)
              .map((it) => ({ ...pick(it, INVOICE_ITEM_FIELDS), itemId: itemMap.get(it._itemId) || undefined }))
              .filter((it) => it.name && it.amount !== undefined),
          },
          payments: {
            create: arr(raw.payments).map((p) => pick(p, PAYMENT_FIELDS)).filter((p) => p.amount !== undefined),
          },
        },
      });
      invoiceNos.add(data.invoiceNo);
      summary.invoices.created++;
    }
  }, { timeout: 60_000 });

  logActivity(req, 'BUSINESS_DATA_IMPORTED', 'Business', businessId, summary);
  res.json({ success: true, data: summary });
});
