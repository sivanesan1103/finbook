import prisma from '../../config/db.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiError } from '../../utils/apiError.js';
import { logActivity } from '../../middlewares/activity.js';
import { fileUrl } from '../../middlewares/upload.js';
import { streamPartyStatement } from '../../utils/pdf.js';
import * as service from './transactions.service.js';

const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });

export const ledger = asyncHandler(async (req, res) =>
  ok(res, await service.partyLedger(req.business.id, req.params.partyId, req.query))
);

export const statementPdf = asyncHandler(async (req, res) => {
  const data = await service.partyLedger(req.business.id, req.params.partyId, req.query);
  streamPartyStatement(res, { business: req.business, ...data });
});

export const create = asyncHandler(async (req, res) => {
  const party = await prisma.party.findFirst({
    where: { id: req.params.partyId, businessId: req.business.id, deletedAt: null },
  });
  if (!party) throw ApiError.notFound('Party not found');

  const tx = await service.createEntry({
    business: req.business,
    party,
    user: req.user,
    data: { ...req.body, billImage: fileUrl(req) },
  });
  logActivity(req, 'TRANSACTION_CREATED', 'Transaction', tx.id, {
    party: party.name, type: tx.type, amount: Number(tx.amount),
  });
  ok(res, tx, 201);
});

export const getOne = asyncHandler(async (req, res) => {
  const tx = await prisma.transaction.findFirst({
    where: { id: req.params.txId, businessId: req.business.id, deletedAt: null },
    include: { party: true, createdBy: { select: { id: true, name: true } } },
  });
  if (!tx) throw ApiError.notFound('Transaction not found');
  ok(res, tx);
});

export const update = asyncHandler(async (req, res) => {
  const existing = await prisma.transaction.findFirst({
    where: { id: req.params.txId, businessId: req.business.id, deletedAt: null },
  });
  if (!existing) throw ApiError.notFound('Transaction not found');
  const tx = await prisma.transaction.update({
    where: { id: existing.id },
    data: { ...req.body, ...(req.file ? { billImage: fileUrl(req) } : {}) },
  });
  logActivity(req, 'TRANSACTION_UPDATED', 'Transaction', tx.id, req.body);
  ok(res, tx);
});

export const softDelete = asyncHandler(async (req, res) => {
  const { count } = await prisma.transaction.updateMany({
    where: { id: req.params.txId, businessId: req.business.id, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  if (!count) throw ApiError.notFound('Transaction not found');
  logActivity(req, 'TRANSACTION_DELETED', 'Transaction', req.params.txId);
  ok(res, { deleted: true });
});
