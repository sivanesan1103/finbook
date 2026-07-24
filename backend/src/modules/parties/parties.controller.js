import prisma from '../../config/db.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiError } from '../../utils/apiError.js';
import { getPagination, paged } from '../../utils/pagination.js';
import { logActivity } from '../../middlewares/activity.js';
import { fileUrl } from '../../middlewares/upload.js';
import { smsGateway, buildPartyWelcomeMessage } from '../../utils/sms.js';
import * as service from './parties.service.js';

const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });

export const list = asyncHandler(async (req, res) => {
  const { page, limit, skip, take } = getPagination(req.query);
  const { parties, total } = await service.listParties(req.business.id, {
    type: req.query.type,
    search: req.query.search,
    sort: req.query.sort,
    skip,
    take,
  });
  res.json({ success: true, ...paged(parties, total, { page, limit }) });
});

export const summary = asyncHandler(async (req, res) =>
  ok(res, await service.summary(req.business.id, req.query.type))
);

export const getOne = asyncHandler(async (req, res) => {
  const party = await prisma.party.findFirst({
    where: { id: req.params.partyId, businessId: req.business.id, deletedAt: null },
  });
  if (!party) throw ApiError.notFound('Party not found');
  const balances = await service.computeBalances(req.business.id, [party.id]);
  ok(res, { ...party, balance: balances.get(party.id) || 0 });
});

export const create = asyncHandler(async (req, res) => {
  const party = await prisma.party.create({ data: { ...req.body, businessId: req.business.id } });
  logActivity(req, 'PARTY_CREATED', 'Party', party.id, { name: party.name, type: party.type });
  if (party.smsEnabled && party.phone) {
    await smsGateway.send({
      to: party.phone,
      message: buildPartyWelcomeMessage({ businessName: req.business.name, partyName: party.name }),
    });
  }
  ok(res, { ...party, balance: 0 }, 201);
});

/** Contact-book style bulk import: [{name, phone, type}] */
export const bulkCreate = asyncHandler(async (req, res) => {
  const result = await prisma.party.createMany({
    data: req.body.parties.map((p) => ({ ...p, businessId: req.business.id })),
  });
  logActivity(req, 'PARTY_BULK_IMPORTED', 'Party', null, { count: result.count });
  ok(res, { created: result.count }, 201);
});

export const update = asyncHandler(async (req, res) => {
  const { count } = await prisma.party.updateMany({
    where: { id: req.params.partyId, businessId: req.business.id, deletedAt: null },
    data: req.body,
  });
  if (!count) throw ApiError.notFound('Party not found');
  const party = await prisma.party.findUnique({ where: { id: req.params.partyId } });
  logActivity(req, 'PARTY_UPDATED', 'Party', party.id, req.body);
  ok(res, party);
});

export const uploadPhoto = asyncHandler(async (req, res) => {
  const { count } = await prisma.party.updateMany({
    where: { id: req.params.partyId, businessId: req.business.id, deletedAt: null },
    data: { photoUrl: fileUrl(req) },
  });
  if (!count) throw ApiError.notFound('Party not found');
  ok(res, await prisma.party.findUnique({ where: { id: req.params.partyId } }));
});

export const softDelete = asyncHandler(async (req, res) => {
  const partyId = req.params.partyId;
  const businessId = req.business.id;

  // Deleting the party but leaving its balance/bills behind would silently
  // orphan them — they'd stop showing in the party list yet still count in
  // reports, dashboard totals, and (for bills) remain payable. Require the
  // ledger to be settled and bills closed first, same as invoice cancel/delete.
  const grouped = await prisma.transaction.groupBy({
    by: ['type'],
    where: { partyId, businessId, deletedAt: null },
    _sum: { amount: true },
  });
  const gave = Number(grouped.find((g) => g.type === 'GAVE')?._sum.amount || 0);
  const got = Number(grouped.find((g) => g.type === 'GOT')?._sum.amount || 0);
  if (gave !== got) {
    throw ApiError.badRequest('Cannot delete a party with an outstanding balance — settle it first');
  }

  const openInvoices = await prisma.invoice.count({
    where: { partyId, businessId, deletedAt: null, status: { in: ['UNPAID', 'PARTIAL', 'OPEN'] } },
  });
  if (openInvoices > 0) {
    throw ApiError.badRequest('Cannot delete a party with open bills — cancel or settle them first');
  }

  const { count } = await prisma.party.updateMany({
    where: { id: partyId, businessId, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  if (!count) throw ApiError.notFound('Party not found');
  logActivity(req, 'PARTY_DELETED', 'Party', partyId);
  ok(res, { deleted: true });
});
