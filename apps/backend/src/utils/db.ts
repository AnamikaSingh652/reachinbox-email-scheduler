import { PrismaClient } from '@prisma/client';
import { logger } from './logger';

export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
});

export let isPostgresConnected = false;

prisma.$connect()
  .then(() => {
    isPostgresConnected = true;
    logger.info('Connected to PostgreSQL database');
  })
  .catch((err: any) => {
    isPostgresConnected = false;
    logger.warn({ err: err.message }, 'Failed to connect to PostgreSQL at startup (will retry on demand)');
  });

export const withDbTimeout = <T>(promise: Promise<T>, ms = 1500): Promise<T> => {
  if (!isPostgresConnected) {
    return Promise.reject(new Error('PostgreSQL offline'));
  }
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('Database timeout')), ms)),
  ]);
};
