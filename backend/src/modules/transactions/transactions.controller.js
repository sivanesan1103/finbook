import prisma from '../../config/db.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiError } from '../../utils/apiError.js';
import { logActivity } from '../../middlewares/activity.js';
import { fileUrl } from '../../middlewares/upload.js';
import { streamPartyStatement } from '../../utils/pdf.js';
import { buildEntryShareMessage } from '../../utils/sms.js';
import { signEntryToken } from '../../utils/shareToken.js';
import env from '../../config/env.js';
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

export const shareLink = asyncHandler(async (req, res) => {
  const tx = await service.entryWithBalance(req.business.id, req.params.txId);
  const link = `${env.publicWebUrl}/t/${signEntryToken(tx.id)}`;
  const message = buildEntryShareMessage({
    businessName: req.business.name,
    amount: tx.amount,
    entryDate: tx.entryDate,
    balance: Math.abs(tx.runningBalance ?? 0),
    link,
    lang: req.user.language,
  });
  ok(res, { message, link });
});

export const update = asyncHandler(async (req, res) => {
  const patch = { ...req.body, ...(req.file ? { billImage: fileUrl(req) } : {}) };
  const tx = await service.updateEntry(req.business.id, req.params.txId, patch);
  logActivity(req, 'TRANSACTION_UPDATED', 'Transaction', tx.id, req.body);
  ok(res, tx);
});

export const softDelete = asyncHandler(async (req, res) => {
  await service.deleteEntry(req.business.id, req.params.txId);
  logActivity(req, 'TRANSACTION_DELETED', 'Transaction', req.params.txId);
  ok(res, { deleted: true });
});
