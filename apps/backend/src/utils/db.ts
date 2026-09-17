import { PrismaClient } from '@prisma/client';
import { logger } from './logger';

export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
});

prisma.$connect()
  .then(() => {
    logger.info('Connected to PostgreSQL database');
  })
  .catch((err: any) => {
    logger.warn({ err: err.message }, 'Failed to connect to PostgreSQL at startup (will retry on demand)');
  });
