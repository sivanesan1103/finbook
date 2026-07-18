import app from './app.js';
import env from './config/env.js';
import logger from './config/logger.js';
import prisma from './config/db.js';

const server = app.listen(env.port, () => {
  logger.info(`FinBook API listening on :${env.port} (${env.nodeEnv})`);
  logger.info(`Swagger docs at http://localhost:${env.port}/api/docs`);
});

const shutdown = async (signal) => {
  logger.info(`${signal} received — shutting down`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
