import { Worker, Job, DelayedError } from 'bullmq';
import { QUEUE_NAME, EmailStatus } from '@reachinbox/shared';
import { config } from '../config';
import { redisOptions } from '../utils/redis';
import { logger } from '../utils/logger';
import { prisma } from '../utils/db';
import { DistributedRateLimiter } from '../services/rateLimiter';
import { EtherealEmailService } from '../integrations/email/ethereal';
import { SlackService } from '../integrations/slack/service';
import { ElasticsearchService } from '../integrations/elasticsearch/client';

export interface EmailJobPayload {
  scheduledEmailId: string;
  senderId: string;
  userId: string;
  campaignId?: string | null;
}

export const processEmailJob = async (job: Job<EmailJobPayload>): Promise<void> => {
  const { scheduledEmailId, senderId, userId } = job.data;

  logger.info({ jobId: job.id, scheduledEmailId, attempt: job.attemptsMade }, 'EMAIL_JOB_STARTED');

  // Step 1: Idempotent atomic DB state transition (scheduled/failed -> processing)
  const updatedCount = await prisma.scheduledEmail.updateMany({
    where: {
      id: scheduledEmailId,
      status: { in: [EmailStatus.SCHEDULED, EmailStatus.FAILED] },
    },
    data: {
      status: EmailStatus.PROCESSING,
      attempts: { increment: 1 },
      bullJobId: job.id,
    },
  });

  if (updatedCount.count === 0) {
    const existing = await prisma.scheduledEmail.findUnique({
      where: { id: scheduledEmailId },
    });

    if (existing?.status === EmailStatus.SENT) {
      logger.info({ scheduledEmailId }, 'Email already sent (idempotent skip)');
      return;
    }

    if (existing?.status === EmailStatus.CANCELLED) {
      logger.info({ scheduledEmailId }, 'Email was cancelled, aborting send');
      return;
    }

    logger.info({ scheduledEmailId, status: existing?.status }, 'Job skipped due to concurrent processing');
    return;
  }

  // Fetch full record and sender info
  const scheduledEmail = await prisma.scheduledEmail.findUnique({
    where: { id: scheduledEmailId },
    include: { sender: true, campaign: true },
  });

  if (!scheduledEmail || !scheduledEmail.sender) {
    await prisma.scheduledEmail.update({
      where: { id: scheduledEmailId },
      data: { status: EmailStatus.FAILED, lastError: 'Sender or email record not found' },
    });
    return;
  }

  const effectiveMinDelay = scheduledEmail.campaign?.delayBetweenEmails ?? config.MIN_DELAY_BETWEEN_EMAILS_MS;
  const effectiveHourlyLimit = scheduledEmail.campaign?.hourlyLimit ?? config.MAX_EMAILS_PER_HOUR_PER_SENDER;

  // Step 2: Distributed Atomic Minimum Delay Reservation Check
  const delayCheck = await DistributedRateLimiter.reserveSenderSendSlot(senderId, effectiveMinDelay);
  if (!delayCheck.allowed) {
    logger.info(
      { senderId, remainingDelayMs: delayCheck.remainingDelayMs },
      'EMAIL_DELAYED: Minimum delay between emails not elapsed'
    );

    // Revert DB state to scheduled
    await prisma.scheduledEmail.update({
      where: { id: scheduledEmailId },
      data: { status: EmailStatus.SCHEDULED },
    });

    // Delay job and throw DelayedError so BullMQ does NOT complete or fail the job
    await job.moveToDelayed(Date.now() + delayCheck.remainingDelayMs, job.token);
    throw new DelayedError();
  }

  // Step 3: Distributed Hourly Rate Limit Check
  const rateCheck = await DistributedRateLimiter.checkAndIncrementHourlyLimit(senderId, effectiveHourlyLimit);
  if (!rateCheck.allowed && rateCheck.nextAvailableWindowMs) {
    logger.info(
      { senderId, limit: effectiveHourlyLimit, nextWindowMs: rateCheck.nextAvailableWindowMs },
      'EMAIL_RATE_LIMITED: Hourly limit reached for sender, rescheduling to next window'
    );

    // Revert DB state to scheduled
    await prisma.scheduledEmail.update({
      where: { id: scheduledEmailId },
      data: { status: EmailStatus.SCHEDULED },
    });

    // Notify Slack about rate limit (deduplicated)
    await SlackService.notifyRateLimitReached({
      userId,
      senderEmail: scheduledEmail.sender.email,
      senderId,
      limit: effectiveHourlyLimit,
    });

    // Delay job until next hour window and throw DelayedError
    const resumeTime = Date.now() + rateCheck.nextAvailableWindowMs;
    await job.moveToDelayed(resumeTime, job.token);
    throw new DelayedError();
  }

  // Step 4: Execute Nodemailer Ethereal SMTP Send
  try {
    const sendResult = await EtherealEmailService.sendMail({
      from: scheduledEmail.sender.email,
      to: scheduledEmail.recipient,
      subject: scheduledEmail.subject,
      body: scheduledEmail.body,
      etherealUser: scheduledEmail.sender.etherealUser,
      etherealPassword: scheduledEmail.sender.etherealPassword,
    });

    // Update last send timestamp for minimum delay
    await DistributedRateLimiter.updateSenderLastSend(senderId);

    // Step 5: Update DB with sent status
    const sentEmail = await prisma.scheduledEmail.update({
      where: { id: scheduledEmailId },
      data: {
        status: EmailStatus.SENT,
        sentAt: new Date(),
        etherealMessageId: sendResult.messageId,
        etherealPreviewUrl: sendResult.previewUrl,
        lastError: null,
      },
    });

    logger.info({ scheduledEmailId, messageId: sendResult.messageId }, 'EMAIL_SENT');

    // Step 6: Index document into Elasticsearch
    await ElasticsearchService.indexEmail({
      emailId: sentEmail.id,
      campaignId: sentEmail.campaignId,
      userId: sentEmail.userId,
      senderId: sentEmail.senderId,
      recipient: sentEmail.recipient,
      subject: sentEmail.subject,
      body: sentEmail.body,
      status: EmailStatus.SENT,
      scheduledAt: sentEmail.scheduledAt,
      sentAt: sentEmail.sentAt,
      createdAt: sentEmail.createdAt,
    });
  } catch (err: any) {
    logger.error({ scheduledEmailId, error: err.message }, 'EMAIL_FAILED');

    await prisma.scheduledEmail.update({
      where: { id: scheduledEmailId },
      data: {
        status: EmailStatus.FAILED,
        lastError: err.message || 'SMTP sending failed',
      },
    });

    throw err; // Allow BullMQ retry strategy if attempts remain
  }
};

export const createEmailWorker = () => {
  const worker = new Worker(QUEUE_NAME, processEmailJob, {
    connection: redisOptions,
    concurrency: config.WORKER_CONCURRENCY,
  });

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id }, 'BullMQ email worker job completed');
  });

  worker.on('failed', (job, err) => {
    if (!(err instanceof DelayedError)) {
      logger.warn({ jobId: job?.id, error: err.message }, 'BullMQ email worker job failed');
    }
  });

  return worker;
};
