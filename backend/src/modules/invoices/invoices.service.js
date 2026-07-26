import prisma from '../../config/db.js';
import { ApiError } from '../../utils/apiError.js';
import { smsGateway, buildSaleConfirmationMessage } from '../../utils/sms.js';

/** Sequential human-friendly numbers per business & doc type: INV-0001…, PI-0001… */
const nextInvoiceNo = async (db, businessId, docType) => {
  const count = await db.invoice.count({ where: { businessId, docType } });
  const prefix = docType === 'PROFORMA' ? 'PI' : 'INV';
  return `${prefix}-${String(count + 1).padStart(4, '0')}`;
};

const computeTotals = (items, discount = 0) => {
  let subtotal = 0;
  let taxAmount = 0;
  const lines = items.map((it) => {
    const base = it.qty * it.price;
    const tax = (base * (it.taxRate || 0)) / 100;
    subtotal += base;
    taxAmount += tax;
    return { ...it, amount: base + tax };
  });
  const total = subtotal + taxAmount - discount;
  if (total < 0) throw ApiError.badRequest('Discount cannot exceed the subtotal plus tax');
  return { lines, subtotal, taxAmount, total };
};

/** Creates the invoice row + lines inside an existing transaction, deducting stock when asked. */
const createDocument = async (txn, businessId, { partyId, docType, status, dueDate, notes, discount, lines, subtotal, taxAmount, total }, { deductStock }) => {
  const invoice = await txn.invoice.create({
    data: {
      businessId,
      partyId,
      invoiceNo: await nextInvoiceNo(txn, businessId, docType),
      docType,
      status,
      dueDate,
      notes,
      subtotal,
      taxAmount,
      discount,
      total,
      stockDeducted: deductStock,
      items: {
        create: lines.map((l) => ({
          itemId: l.itemId ?? null,
          name: l.name,
          qty: l.qty,
          price: l.price,
          taxRate: l.taxRate || 0,
          amount: l.amount,
        })),
      },
    },
    include: { items: true, party: true },
  });

  if (deductStock) {
    for (const line of lines.filter((l) => l.itemId)) {
      // Conditional update — atomically scoped to this business and guarded
      // against overselling, so it can't race with a concurrent sale of the
      // same item, and can't touch another business's item.
      const { count } = await txn.item.updateMany({
        where: { id: line.itemId, businessId, stockQty: { gte: line.qty } },
        data: { stockQty: { decrement: line.qty } },
      });
      if (count === 0) throw ApiError.badRequest(`Insufficient stock for "${line.name}"`);
      await txn.stockMovement.create({
        data: { itemId: line.itemId, type: 'OUT', qty: line.qty, note: `Invoice ${invoice.invoiceNo}` },
      });
    }
  }
  return invoice;
};

export const createInvoice = async (businessId, { partyId, items, discount = 0, dueDate, notes, status }, docType = 'INVOICE', lang) => {
  const party = await prisma.party.findFirst({ where: { id: partyId, businessId, deletedAt: null } });
  if (!party) throw ApiError.notFound('Party not found');

  const itemIds = [...new Set(items.filter((it) => it.itemId).map((it) => it.itemId))];
  if (itemIds.length) {
    const owned = await prisma.item.count({ where: { id: { in: itemIds }, businessId, deletedAt: null } });
    if (owned !== itemIds.length) throw ApiError.badRequest('One or more items do not belong to this business');
  }

  const { lines, subtotal, taxAmount, total } = computeTotals(items, discount);
  const finalStatus = docType === 'PROFORMA' ? 'OPEN' : status || 'UNPAID';

  // nextInvoiceNo() reads a count outside any lock, so two concurrent sales
  // for the same business/docType can land on the same number — the unique
  // constraint on (businessId, invoiceNo) catches it (P2002); retry with a
  // fresh count instead of failing a legitimate concurrent sale outright.
  let invoice;
  for (let attempt = 1; ; attempt++) {
    try {
      invoice = await prisma.$transaction((txn) =>
        createDocument(
          txn,
          businessId,
          { partyId, docType, status: finalStatus, dueDate, notes, discount, lines, subtotal, taxAmount, total },
          // Proformas never touch stock; draft invoices wait until finalised.
          { deductStock: docType === 'INVOICE' && finalStatus !== 'DRAFT' }
        )
      );
      break;
    } catch (e) {
      if (e.code === 'P2002' && attempt < 5) continue;
      throw e;
    }
  }

  if (docType === 'INVOICE' && party.smsEnabled && party.phone) {
    const business = await prisma.business.findUnique({ where: { id: businessId }, select: { name: true } });
    await smsGateway.send({
      to: party.phone,
      message: buildSaleConfirmationMessage({
        businessName: business.name,
        partyName: party.name,
        invoiceNo: invoice.invoiceNo,
        total: Number(invoice.total),
        lang,
      }),
    });
  }
  return invoice;
};

/** Turns an OPEN proforma into a real UNPAID invoice (stock deducted, proforma marked CONVERTED). */
export const convertProforma = async (businessId, proformaId) => {
  const proforma = await prisma.invoice.findFirst({
    where: { id: proformaId, businessId, docType: 'PROFORMA', deletedAt: null },
    include: { items: true },
  });
  if (!proforma) throw ApiError.notFound('Proforma invoice not found');
  if (proforma.status !== 'OPEN') throw ApiError.badRequest(`Proforma is ${proforma.status.toLowerCase()}, only open ones can be converted`);

  return prisma.$transaction(async (txn) => {
    const invoice = await createDocument(
      txn,
      businessId,
      {
        partyId: proforma.partyId,
        docType: 'INVOICE',
        status: 'UNPAID',
        dueDate: proforma.dueDate,
        notes: proforma.notes,
        discount: proforma.discount,
        lines: proforma.items.map((it) => ({
          itemId: it.itemId,
          name: it.name,
          qty: Number(it.qty),
          price: Number(it.price),
          taxRate: Number(it.taxRate),
          amount: Number(it.amount),
        })),
        subtotal: proforma.subtotal,
        taxAmount: proforma.taxAmount,
        total: proforma.total,
      },
      { deductStock: true }
    );
    await txn.invoice.update({
      where: { id: proforma.id },
      data: { status: 'CONVERTED', convertedToId: invoice.id },
    });
    return invoice;
  });
};

/** Records a payment against an invoice and rolls the status forward. */
export const recordPayment = async (businessId, invoiceId, { amount, mode, note, paidAt }) => {
  return prisma.$transaction(async (txn) => {
    const invoice = await txn.invoice.findFirst({
      where: { id: invoiceId, businessId, docType: 'INVOICE', deletedAt: null },
    });
    if (!invoice) throw ApiError.notFound('Invoice not found');
    if (invoice.status === 'CANCELLED') throw ApiError.badRequest('Invoice is cancelled');

    const newPaid = Number(invoice.amountPaid) + amount;
    if (newPaid > Number(invoice.total) + 0.01) throw ApiError.badRequest('Payment exceeds invoice total');
    const status = newPaid >= Number(invoice.total) ? 'PAID' : 'PARTIAL';

    // Conditional update guarded on the amountPaid we just read — if a
    // concurrent payment lands first, this matches 0 rows and we fail loudly
    // instead of both payments silently applying on top of a stale read.
    const { count } = await txn.invoice.updateMany({
      where: { id: invoiceId, amountPaid: invoice.amountPaid },
      data: { amountPaid: newPaid, status },
    });
    if (count === 0) throw ApiError.conflict('This invoice was just updated by another payment — please retry');

    const payment = await txn.payment.create({ data: { invoiceId, amount, mode: mode || 'CASH', note, paidAt } });
    await txn.cashbookEntry.create({
      data: {
        businessId,
        direction: 'IN',
        amount,
        paymentMode: mode || 'CASH',
        description: `Payment for invoice ${invoice.invoiceNo}`,
      },
    });
    return { payment, status, amountPaid: newPaid };
  });
};
