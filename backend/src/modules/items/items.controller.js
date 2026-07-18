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
    ...(req.query.search ? { name: { contains: req.query.search } } : {}),
    ...(req.query.lowStock === 'true' ? {} : {}),
  };
  let [rows, total] = await Promise.all([
    prisma.item.findMany({ where, orderBy: { name: 'asc' }, skip, take }),
    prisma.item.count({ where }),
  ]);
  if (req.query.lowStock === 'true') {
    rows = rows.filter((i) => i.lowStockAlert != null && Number(i.stockQty) <= Number(i.lowStockAlert));
    total = rows.length;
  }
  res.json({ success: true, ...paged(rows, total, { page, limit }) });
});

export const getOne = asyncHandler(async (req, res) => {
  const item = await prisma.item.findFirst({
    where: { id: req.params.itemId, businessId: req.business.id, deletedAt: null },
    include: { movements: { orderBy: { createdAt: 'desc' }, take: 50 } },
  });
  if (!item) throw ApiError.notFound('Item not found');
  ok(res, item);
});

export const create = asyncHandler(async (req, res) => {
  const item = await prisma.item.create({
    data: { ...req.body, businessId: req.business.id, imageUrl: fileUrl(req) },
  });
  if (Number(item.stockQty) > 0) {
    await prisma.stockMovement.create({
      data: { itemId: item.id, type: 'IN', qty: item.stockQty, note: 'Opening stock' },
    });
  }
  logActivity(req, 'ITEM_CREATED', 'Item', item.id, { name: item.name });
  ok(res, item, 201);
});

export const update = asyncHandler(async (req, res) => {
  const { count } = await prisma.item.updateMany({
    where: { id: req.params.itemId, businessId: req.business.id, deletedAt: null },
    data: { ...req.body, ...(req.file ? { imageUrl: fileUrl(req) } : {}) },
  });
  if (!count) throw ApiError.notFound('Item not found');
  ok(res, await prisma.item.findUnique({ where: { id: req.params.itemId } }));
});

/** Stock adjustment: {type: IN|OUT|ADJUST, qty, note}. ADJUST sets absolute qty. */
export const adjustStock = asyncHandler(async (req, res) => {
  const item = await prisma.item.findFirst({
    where: { id: req.params.itemId, businessId: req.business.id, deletedAt: null },
  });
  if (!item) throw ApiError.notFound('Item not found');

  const { type, qty, note } = req.body;
  let newQty;
  if (type === 'IN') newQty = Number(item.stockQty) + qty;
  else if (type === 'OUT') newQty = Number(item.stockQty) - qty;
  else newQty = qty;
  if (newQty < 0) throw ApiError.badRequest('Stock cannot go negative');

  const [updated] = await prisma.$transaction([
    prisma.item.update({ where: { id: item.id }, data: { stockQty: newQty } }),
    prisma.stockMovement.create({ data: { itemId: item.id, type, qty, note } }),
  ]);
  logActivity(req, 'STOCK_ADJUSTED', 'Item', item.id, { type, qty, newQty });
  ok(res, updated);
});

export const softDelete = asyncHandler(async (req, res) => {
  const { count } = await prisma.item.updateMany({
    where: { id: req.params.itemId, businessId: req.business.id, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  if (!count) throw ApiError.notFound('Item not found');
  logActivity(req, 'ITEM_DELETED', 'Item', req.params.itemId);
  ok(res, { deleted: true });
});
