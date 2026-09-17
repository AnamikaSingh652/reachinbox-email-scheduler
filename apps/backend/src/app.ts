import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';

import { config } from './config';
import { emailQueue } from './queues/emailQueue';
import { errorHandler } from './middleware/errorHandler';
import { prisma } from './utils/db';
import { redis } from './utils/redis';
import { esClient } from './integrations/elasticsearch/client';

import authRouter from './routes/auth';
import emailsRouter from './routes/emails';
import campaignsRouter from './routes/campaigns';
import sendersRouter from './routes/senders';
import slackRouter from './routes/slack';
import adminRouter from './routes/admin';

export const createApp = () => {
  const app = express();

  // Helmet & CORS configuration
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(
    cors({
      origin: [config.FRONTEND_URL, 'http://localhost:3000', 'http://127.0.0.1:3000'],
      credentials: true,
    })
  );

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(cookieParser());

  // Set up Bull-Board queue monitoring dashboard
  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath('/admin/queues');

  createBullBoard({
    queues: [new BullMQAdapter(emailQueue) as any],
    serverAdapter,
  });

  app.use('/admin/queues', serverAdapter.getRouter());

  // Health check endpoint with deep service status checks
  const handleHealthCheck = async (req: express.Request, res: express.Response) => {
    let postgresStatus = 'ok';
    let redisStatus = 'ok';
    let elasticsearchStatus = 'ok';
    let queueStatus = 'ok';

    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      postgresStatus = 'error';
    }

    try {
      await redis.ping();
    } catch {
      redisStatus = 'error';
    }

    try {
      await esClient.ping();
    } catch {
      elasticsearchStatus = 'error';
    }

    try {
      await emailQueue.getJobCounts();
    } catch {
      queueStatus = 'error';
    }

    res.json({
      api: 'ok',
      postgres: postgresStatus,
      redis: redisStatus,
      elasticsearch: elasticsearchStatus,
      queue: queueStatus,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  };

  app.get('/health', handleHealthCheck);
  app.get('/api/health', handleHealthCheck);

  // Root API status endpoint
  app.get('/', (req: express.Request, res: express.Response) => {
    res.json({
      name: 'ReachInbox Email Scheduler API',
      status: 'active',
      version: '1.0.0',
      endpoints: {
        health: '/api/health',
        auth: '/api/auth/me',
        queues: '/admin/queues',
        emails: '/api/emails/scheduled',
      },
    });
  });

  // API Routes
  app.use('/api/auth', authRouter);
  app.use('/api/emails', emailsRouter);
  app.use('/api/campaigns', campaignsRouter);
  app.use('/api/senders', sendersRouter);
  app.use('/api/slack', slackRouter);
  app.use('/api/admin', adminRouter);

  // Frontend static build fallback if apps/frontend/dist exists
  const frontendDistPath = path.resolve(__dirname, '../../frontend/dist');
  if (fs.existsSync(frontendDistPath)) {
    app.use(express.static(frontendDistPath));
    app.get('*', (req: express.Request, res: express.Response, next: express.NextFunction) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/admin')) {
        return next();
      }
      res.sendFile(path.join(frontendDistPath, 'index.html'));
    });
  }

  // Centralized Error Handler
  app.use(errorHandler);

  return app;
};
