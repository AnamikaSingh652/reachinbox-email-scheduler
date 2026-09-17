import { createApp } from './app';
import { config } from './config';
import { logger } from './utils/logger';
import { createEmailWorker } from './workers/emailWorker';
import { ElasticsearchService } from './integrations/elasticsearch/client';
import { QueueRecoveryService } from './services/recovery';

const app = createApp();

const startServer = () => {
  // 1. Start Express HTTP API server immediately so port 5000 is ALWAYS listening
  const server = app.listen(config.PORT, '0.0.0.0', () => {
    logger.info(`ReachInbox Backend API running on port ${config.PORT}`);
    logger.info(`BullMQ Dashboard available at http://localhost:${config.PORT}/admin/queues`);
  });

  // 2. Initialize external infrastructure services non-blockingly
  setTimeout(async () => {
    try {
      await ElasticsearchService.initIndex();
    } catch (err: any) {
      logger.warn({ error: err.message }, 'Elasticsearch initialization skipped/failed');
    }

    try {
      await QueueRecoveryService.recoverScheduledJobs();
    } catch (err: any) {
      logger.warn({ error: err.message }, 'Queue recovery check skipped/failed');
    }

    try {
      const worker = createEmailWorker();
      logger.info({ concurrency: config.WORKER_CONCURRENCY }, 'BullMQ Email Worker initialized');

      const shutdown = async () => {
        logger.info('Shutting down server gracefully...');
        try { await worker.close(); } catch {}
        server.close(() => process.exit(0));
      };

      process.on('SIGTERM', shutdown);
      process.on('SIGINT', shutdown);
    } catch (err: any) {
      logger.warn({ error: err.message }, 'BullMQ Email Worker creation skipped (using InMemoryQueueService)');
    }
  }, 100);
};

process.on('uncaughtException', (err: any) => {
  logger.warn({ error: err?.message || err }, 'Uncaught exception caught (server process will stay active)');
});

process.on('unhandledRejection', (reason: any) => {
  logger.warn({ reason: reason?.message || reason }, 'Unhandled rejection caught (server process will stay active)');
});

startServer();
