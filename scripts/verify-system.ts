import dotenv from 'dotenv';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { Client } from '@elastic/elasticsearch';
import { Queue } from 'bullmq';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config();

async function runVerification() {
  console.log('\n🔍 ReachInbox System Verification Starting...\n');

  let hasErrors = false;

  // 1. PostgreSQL Check
  try {
    const dbUrl = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/reachinbox_db?schema=public';
    const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    await prisma.$queryRaw`SELECT 1`;
    console.log('  ✓ PostgreSQL connection successful');
    await prisma.$disconnect();
  } catch (err: any) {
    console.error('  ✕ PostgreSQL connection failed:', err.message);
    hasErrors = true;
  }

  // 2. Redis Check
  try {
    const redisHost = process.env.REDIS_HOST || 'localhost';
    const redisPort = Number(process.env.REDIS_PORT || 6379);
    const redisPassword = process.env.REDIS_PASSWORD || undefined;

    const redis = new Redis({ host: redisHost, port: redisPort, password: redisPassword, maxRetriesPerRequest: 1 });
    const pingRes = await redis.ping();
    if (pingRes === 'PONG') {
      console.log('  ✓ Redis connection successful');
    } else {
      throw new Error(`Unexpected PING response: ${pingRes}`);
    }
    redis.disconnect();
  } catch (err: any) {
    console.error('  ✕ Redis connection failed:', err.message);
    hasErrors = true;
  }

  // 3. Elasticsearch Check
  try {
    const esUrl = process.env.ELASTICSEARCH_URL || 'http://localhost:9200';
    const esClient = new Client({ node: esUrl, requestTimeout: 3000 });
    await esClient.ping();
    console.log('  ✓ Elasticsearch connection successful');
  } catch (err: any) {
    console.error('  ✕ Elasticsearch connection failed:', err.message);
    hasErrors = true;
  }

  // 4. BullMQ Queue Check
  try {
    const redisHost = process.env.REDIS_HOST || 'localhost';
    const redisPort = Number(process.env.REDIS_PORT || 6379);
    const redisPassword = process.env.REDIS_PASSWORD || undefined;

    const queue = new Queue('email-send', {
      connection: { host: redisHost, port: redisPort, password: redisPassword, maxRetriesPerRequest: null },
    });
    await queue.getJobCounts();
    console.log('  ✓ Queue (BullMQ) connection successful');
    await queue.close();
  } catch (err: any) {
    console.error('  ✕ Queue (BullMQ) connection failed:', err.message);
    hasErrors = true;
  }

  console.log('');
  if (hasErrors) {
    console.log('⚠️  Verification complete with warnings/failures. Ensure Docker infrastructure is running (docker compose up -d).');
  } else {
    console.log('🎉 All infrastructure connections verified successfully!');
  }
  process.exit(hasErrors ? 1 : 0);
}

runVerification();
