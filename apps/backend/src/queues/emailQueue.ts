import { Queue } from 'bullmq';
import { QUEUE_NAME } from '@reachinbox/shared';
import { redisOptions } from '../utils/redis';
import { logger } from '../utils/logger';

export const emailQueue = new Queue(QUEUE_NAME, {
  connection: redisOptions,
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 10000,
    },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
  },
});

emailQueue.on('error', (err) => {
  logger.warn({ error: err.message }, 'BullMQ Queue error');
});
