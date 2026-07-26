import prisma from '../../config/db.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiError } from '../../utils/apiError.js';
import { getPagination, paged } from '../../utils/pagination.js';
import { logActivity } from '../../middlewares/activity.js';
import { streamInvoicePdf } from '../../utils/pdf.js';
import * as service from './invoices.service.js';

const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });

/** Routes mount this controller for both tax invoices and proformas; req.docType picks the set. */
const docTypeOf = (req) => req.docType || 'INVOICE';

export const list = asyncHandler(async (req, res) => {
  const { page, limit, skip, take } = getPagination(req.query);
  const docType = docTypeOf(req);
  const where = {
    businessId: req.business.id,
    docType,
    deletedAt: null,
    ...(req.query.status ? { status: req.query.status } : {}),
    ...(req.query.partyId ? { partyId: req.query.partyId } : {}),
    ...(req.query.search ? { invoiceNo: { contains: req.query.search } } : {}),
  };
  const [rows, total, agg, openAgg] = await Promise.all([
    prisma.invoice.findMany({
      where,
      include: { party: { select: { id: true, name: true, phone: true } } },
      orderBy: { issueDate: 'desc' },
      skip,
      take,
    }),
    prisma.invoice.count({ where }),
    prisma.invoice.aggregate({ where, _sum: { total: true, amountPaid: true } }),
    docType === 'PROFORMA'
      ? prisma.invoice.aggregate({ where: { ...where, status: 'OPEN' }, _sum: { total: true }, _count: true })
      : Promise.resolve(null),
  ]);
  res.json({
    success: true,
    ...paged(rows, total, { page, limit }),
    summary: {
      totalBilled: Number(agg._sum.total || 0),
      totalCollected: Number(agg._sum.amountPaid || 0),
      ...(openAgg ? { openAmount: Number(openAgg._sum.total || 0), openCount: openAgg._count } : {}),
    },
  });
});

export const getOne = asyncHandler(async (req, res) => {
  const invoice = await prisma.invoice.findFirst({
    where: { id: req.params.invoiceId, businessId: req.business.id, docType: docTypeOf(req), deletedAt: null },
    include: { items: true, party: true, payments: { orderBy: { paidAt: 'desc' } }, convertedTo: { select: { id: true, invoiceNo: true } } },
  });
  if (!invoice) throw ApiError.notFound('Invoice not found');
  ok(res, invoice);
});

export const create = asyncHandler(async (req, res) => {
  const docType = docTypeOf(req);
  const invoice = await service.createInvoice(req.business.id, req.body, docType, req.user.language);
  logActivity(req, docType === 'PROFORMA' ? 'PROFORMA_CREATED' : 'INVOICE_CREATED', 'Invoice', invoice.id, {
    invoiceNo: invoice.invoiceNo, total: Number(invoice.total),
  });
  ok(res, invoice, 201);
});

export const pay = asyncHandler(async (req, res) => {
  const result = await service.recordPayment(req.business.id, req.params.invoiceId, req.body);
  logActivity(req, 'PAYMENT_RECORDED', 'Invoice', req.params.invoiceId, { amount: req.body.amount });
  ok(res, result, 201);
});

export const convert = asyncHandler(async (req, res) => {
  const invoice = await service.convertProforma(req.business.id, req.params.invoiceId);
  logActivity(req, 'PROFORMA_CONVERTED', 'Invoice', req.params.invoiceId, {
    invoiceNo: invoice.invoiceNo, total: Number(invoice.total),
  });
  ok(res, invoice, 201);
});

/** Restores stock deducted at creation, inside the caller's transaction. Idempotent via stockDeducted. */
const revertStock = async (txn, invoice) => {
  if (!invoice.stockDeducted) return;
  for (const line of invoice.items.filter((l) => l.itemId)) {
    await txn.item.update({
      where: { id: line.itemId },
      data: { stockQty: { increment: Number(line.qty) } },
    });
    await txn.stockMovement.create({
      data: { itemId: line.itemId, type: 'IN', qty: Number(line.qty), note: `Reversed — invoice ${invoice.invoiceNo}` },
    });
  }
  await txn.invoice.update({ where: { id: invoice.id }, data: { stockDeducted: false } });
};

export const cancel = asyncHandler(async (req, res) => {
  await prisma.$transaction(async (txn) => {
    const invoice = await txn.invoice.findFirst({
      where: {
        id: req.params.invoiceId,
        businessId: req.business.id,
        docType: docTypeOf(req),
        deletedAt: null,
        status: { notIn: ['PAID', 'CONVERTED'] },
      },
      include: { items: true },
    });
    if (!invoice) throw ApiError.badRequest('Invoice not found or already settled');
    // Cancelling would otherwise leave payments/cashbook entries recorded
    // against a sale that no longer exists — block it instead of guessing
    // at refund semantics.
    if (Number(invoice.amountPaid) > 0) {
      throw ApiError.badRequest('Cannot cancel an invoice with payments recorded against it');
    }
    await revertStock(txn, invoice);
    await txn.invoice.update({ where: { id: invoice.id }, data: { status: 'CANCELLED' } });
  });
  logActivity(req, 'INVOICE_CANCELLED', 'Invoice', req.params.invoiceId);
  ok(res, { cancelled: true });
});

export const softDelete = asyncHandler(async (req, res) => {
  await prisma.$transaction(async (txn) => {
    const invoice = await txn.invoice.findFirst({
      where: { id: req.params.invoiceId, businessId: req.business.id, docType: docTypeOf(req), deletedAt: null },
      include: { items: true },
    });
    if (!invoice) throw ApiError.notFound('Invoice not found');
    if (Number(invoice.amountPaid) > 0) {
      throw ApiError.badRequest('Cannot delete an invoice with payments recorded against it — cancel is also blocked for the same reason');
    }
    await revertStock(txn, invoice);
    await txn.invoice.update({ where: { id: invoice.id }, data: { deletedAt: new Date() } });
  });
  logActivity(req, 'INVOICE_DELETED', 'Invoice', req.params.invoiceId);
  ok(res, { deleted: true });
});

export const pdf = asyncHandler(async (req, res) => {
  const invoice = await prisma.invoice.findFirst({
    where: { id: req.params.invoiceId, businessId: req.business.id, docType: docTypeOf(req), deletedAt: null },
    include: { items: true, party: true },
  });
  if (!invoice) throw ApiError.notFound('Invoice not found');
  streamInvoicePdf(res, { business: req.business, invoice });
});
