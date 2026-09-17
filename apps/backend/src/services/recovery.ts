import { prisma } from '../utils/db';
import { emailQueue } from '../queues/emailQueue';
import { EmailStatus } from '@reachinbox/shared';
import { logger } from '../utils/logger';

export class QueueRecoveryService {
  /**
   * Scans PostgreSQL on startup for `scheduled` emails and ensures they exist in BullMQ.
   * Guarantees persistence recovery across server, worker, or Redis crashes.
   */
  public static async recoverScheduledJobs(): Promise<{ recoveredCount: number }> {
    try {
      const scheduledEmails = await prisma.scheduledEmail.findMany({
        where: { status: EmailStatus.SCHEDULED },
        orderBy: { scheduledAt: 'asc' },
      });

      if (scheduledEmails.length === 0) {
        logger.info('Recovery check: No pending scheduled emails in database');
        return { recoveredCount: 0 };
      }

      const now = Date.now();
      let recoveredCount = 0;

      for (const email of scheduledEmails) {
        const jobId = `email-${email.id}`;
        const existingJob = await emailQueue.getJob(jobId);

        if (!existingJob) {
          const delay = Math.max(0, email.scheduledAt.getTime() - now);
          await emailQueue.add(
            'send-email',
            {
              scheduledEmailId: email.id,
              senderId: email.senderId,
              userId: email.userId,
              campaignId: email.campaignId,
            },
            {
              delay,
              jobId,
            }
          );
          recoveredCount++;
        }
      }

      if (recoveredCount > 0) {
        logger.info({ recoveredCount }, 'RECOVERY: Successfully recovered orphaned scheduled jobs into BullMQ');
      }

      return { recoveredCount };
    } catch (err: any) {
      logger.warn({ error: err.message }, 'Queue recovery check encountered warning (will continue)');
      return { recoveredCount: 0 };
    }
  }
}
