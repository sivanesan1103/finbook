import { PrismaClient } from '@prisma/client';
import logger from './logger.js';
import { notifyDbError } from './discordNotifier.js';

// Single Prisma client instance shared across the app.
// `emit: 'event'` (rather than the 'stdout' shorthand) routes Prisma's own
// query/connection errors through our structured winston logger instead of
// printing raw unstructured text straight to the console — otherwise they'd
// only ever show up in the dashboard's generic "all logs" panel, not the
// dedicated server-errors one, since they'd never carry `type`/`level` fields.
const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development'
    ? [{ emit: 'event', level: 'warn' }, { emit: 'event', level: 'error' }]
    : [{ emit: 'event', level: 'error' }],
});

prisma.$on('warn', (e) => logger.warn(e.message, { type: 'db' }));
prisma.$on('error', (e) => { logger.error(e.message, { type: 'db' }); notifyDbError(e.message); });

export default prisma;
