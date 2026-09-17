import { createApp } from './app';
import { config } from './config';
import { logger } from './utils/logger';
import { createEmailWorker } from './workers/emailWorker';
import { ElasticsearchService } from './integrations/elasticsearch/client';
import { QueueRecoveryService } from './services/recovery';

const app = createApp();

const startServer = async () => {
  try {
    // Initialize Elasticsearch index
    await ElasticsearchService.initIndex();

    // Run Queue Recovery to ensure any pending PostgreSQL scheduled jobs exist in BullMQ
    await QueueRecoveryService.recoverScheduledJobs();

    // Launch BullMQ Email Worker
    const worker = createEmailWorker();
    logger.info({ concurrency: config.WORKER_CONCURRENCY }, 'BullMQ Email Worker initialized and listening for jobs');

    app.listen(config.PORT, () => {
      logger.info(`ReachInbox Backend API running on port ${config.PORT}`);
      logger.info(`BullMQ Dashboard available at http://localhost:${config.PORT}/admin/queues`);
    });

    const shutdown = async () => {
      logger.info('Shutting down server gracefully...');
      await worker.close();
      process.exit(0);
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  } catch (err: any) {
    logger.error({ error: err.message }, 'Failed to start backend server');
    process.exit(1);
  }
};

startServer();
