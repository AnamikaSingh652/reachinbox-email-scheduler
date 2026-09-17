import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

// Load .env file from monorepo root or backend root
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });
dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().transform(Number).default('5000'),
  SESSION_SECRET: z.string().default('reachinbox_default_session_secret_32bytes'),
  FRONTEND_URL: z.string().default('http://localhost:3000'),
  
  DATABASE_URL: z.string().default('postgresql://postgres:postgres@localhost:5432/reachinbox_db?schema=public'),
  
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.string().transform(Number).default('6379'),
  REDIS_PASSWORD: z.string().optional().default(''),
  
  WORKER_CONCURRENCY: z.string().transform(Number).default('5'),
  MIN_DELAY_BETWEEN_EMAILS_MS: z.string().transform(Number).default('2000'),
  MAX_EMAILS_PER_HOUR_PER_SENDER: z.string().transform(Number).default('200'),
  
  ELASTICSEARCH_URL: z.string().default('http://localhost:9200'),
  
  GOOGLE_CLIENT_ID: z.string().default('mock-google-client-id'),
  GOOGLE_CLIENT_SECRET: z.string().default('mock-google-client-secret'),
  GOOGLE_CALLBACK_URL: z.string().default('http://localhost:5000/api/auth/google/callback'),
  
  SLACK_CLIENT_ID: z.string().default('mock-slack-client-id'),
  SLACK_CLIENT_SECRET: z.string().default('mock-slack-client-secret'),
  SLACK_REDIRECT_URI: z.string().default('http://localhost:5000/api/slack/callback'),
  
  ETHEREAL_HOST: z.string().default('smtp.ethereal.email'),
  ETHEREAL_PORT: z.string().transform(Number).default('587'),
  ETHEREAL_USER: z.string().optional().default(''),
  ETHEREAL_PASSWORD: z.string().optional().default(''),
});

const parsedEnv = envSchema.parse(process.env);

export const config = {
  ...parsedEnv,
  isProd: parsedEnv.NODE_ENV === 'production',
  isTest: parsedEnv.NODE_ENV === 'test',
};
