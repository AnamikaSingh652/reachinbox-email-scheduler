import Redis from 'ioredis';
import { config } from '../config';
import { logger } from './logger';

export const redisOptions = {
  host: config.REDIS_HOST,
  port: config.REDIS_PORT,
  password: config.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null, // Required by BullMQ
  enableReadyCheck: false,
};

export const redis = new Redis(redisOptions);

redis.on('connect', () => {
  logger.info({ host: config.REDIS_HOST, port: config.REDIS_PORT }, 'Redis client connected');
});

redis.on('error', (err) => {
  logger.warn({ error: err.message }, 'Redis connection warning/error');
});

export const getDuplicateRedisClient = () => {
  return new Redis(redisOptions);
};
