import prisma from '../../config/db.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiError } from '../../utils/apiError.js';
import { logActivity } from '../../middlewares/activity.js';
import { smsGateway, buildReminderMessage } from '../../utils/sms.js';
import { computeBalances } from '../parties/parties.service.js';

const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });

export const list = asyncHandler(async (req, res) => {
  const reminders = await prisma.reminder.findMany({
    where: {
      businessId: req.business.id,
      deletedAt: null,
      ...(req.query.status ? { status: req.query.status } : {}),
    },
    include: { party: { select: { id: true, name: true, phone: true } } },
    orderBy: { dueDate: 'asc' },
  });
  ok(res, reminders);
});

export const create = asyncHandler(async (req, res) => {
  const party = await prisma.party.findFirst({
    where: { id: req.body.partyId, businessId: req.business.id, deletedAt: null },
  });
  if (!party) throw ApiError.notFound('Party not found');
  const reminder = await prisma.reminder.create({
    data: { ...req.body, businessId: req.business.id },
    include: { party: true },
  });
  logActivity(req, 'REMINDER_CREATED', 'Reminder', reminder.id, { party: party.name });
  ok(res, reminder, 201);
});

/** Sends the reminder now over the chosen channel (SMS/WhatsApp-ready gateway). */
export const sendNow = asyncHandler(async (req, res) => {
  const reminder = await prisma.reminder.findFirst({
    where: { id: req.params.reminderId, businessId: req.business.id, deletedAt: null },
    include: { party: true },
  });
  if (!reminder) throw ApiError.notFound('Reminder not found');
  if (!reminder.party.phone) throw ApiError.badRequest('Party has no phone number');

  const balances = await computeBalances(req.business.id, [reminder.partyId]);
  const balance = Math.abs(balances.get(reminder.partyId) || 0);
  const message = reminder.message || buildReminderMessage({
    businessName: req.business.name,
    partyName: reminder.party.name,
    balance,
    dueDate: reminder.dueDate,
  });

  await smsGateway.send({ to: reminder.party.phone, message, channel: reminder.channel });
  const updated = await prisma.reminder.update({
    where: { id: reminder.id },
    data: { status: 'SENT', sentAt: new Date() },
  });
  logActivity(req, 'REMINDER_SENT', 'Reminder', reminder.id, { channel: reminder.channel });
  ok(res, updated);
});

export const cancel = asyncHandler(async (req, res) => {
  const { count } = await prisma.reminder.updateMany({
    where: { id: req.params.reminderId, businessId: req.business.id, deletedAt: null, status: 'PENDING' },
    data: { status: 'CANCELLED' },
  });
  if (!count) throw ApiError.notFound('Pending reminder not found');
  ok(res, { cancelled: true });
});
