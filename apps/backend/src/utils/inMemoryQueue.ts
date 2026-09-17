import { EmailStatus } from '@reachinbox/shared';
import { inMemoryStore } from './inMemoryStore';
import { EtherealEmailService } from '../integrations/email/ethereal';
import { logger } from './logger';
import { prisma } from './db';

export class InMemoryQueueService {
  /**
   * Enqueues an email job into the fallback background worker timer.
   */
  public static enqueueEmailJob(params: {
    scheduledEmailId: string;
    senderId: string;
    userId: string;
    delayMs: number;
  }): void {
    const { scheduledEmailId, delayMs } = params;

    logger.info({ scheduledEmailId, delayMs }, 'IN_MEMORY_QUEUE: Job enqueued with delay');

    setTimeout(async () => {
      await this.processJob(scheduledEmailId);
    }, Math.max(10, delayMs));
  }

  private static async processJob(scheduledEmailId: string): Promise<void> {
    logger.info({ scheduledEmailId }, 'IN_MEMORY_QUEUE: Executing email send worker job');

    let email = inMemoryStore.scheduledEmails.get(scheduledEmailId);

    // Try DB first if available, else use in-memory store
    try {
      const dbEmail = await prisma.scheduledEmail.findUnique({
        where: { id: scheduledEmailId },
        include: { sender: true },
      });

      if (dbEmail) {
        // Transition state to processing
        await prisma.scheduledEmail.update({
          where: { id: scheduledEmailId },
          data: { status: EmailStatus.PROCESSING as any, attempts: { increment: 1 } },
        });

        // Send via Nodemailer Ethereal
        const sendResult = await EtherealEmailService.sendMail({
          from: dbEmail.sender?.email || 'sales@reachinbox.ai',
          to: dbEmail.recipient,
          subject: dbEmail.subject,
          body: dbEmail.body,
          etherealUser: dbEmail.sender?.etherealUser,
          etherealPassword: dbEmail.sender?.etherealPassword,
        });

        // Update DB status to SENT
        await prisma.scheduledEmail.update({
          where: { id: scheduledEmailId },
          data: {
            status: EmailStatus.SENT as any,
            sentAt: new Date(),
            etherealMessageId: sendResult.messageId,
            etherealPreviewUrl: sendResult.previewUrl,
          },
        });

        logger.info({ scheduledEmailId, messageId: sendResult.messageId }, 'IN_MEMORY_QUEUE: Email sent successfully via DB/Ethereal');
        return;
      }
    } catch (err: any) {
      logger.info({ scheduledEmailId }, 'DB unavailable, processing email using InMemoryStore');
    }

    if (!email) return;

    // Transition state in memory
    inMemoryStore.updateScheduledEmail(scheduledEmailId, {
      status: EmailStatus.PROCESSING,
      attempts: email.attempts + 1,
    });

    try {
      const sender = inMemoryStore.senders.get(email.senderId);
      const sendResult = await EtherealEmailService.sendMail({
        from: sender?.email || 'sales@reachinbox.ai',
        to: email.recipient,
        subject: email.subject,
        body: email.body,
        etherealUser: sender?.etherealUser,
        etherealPassword: sender?.etherealPassword,
      });

      inMemoryStore.updateScheduledEmail(scheduledEmailId, {
        status: EmailStatus.SENT,
        sentAt: new Date(),
        etherealMessageId: sendResult.messageId,
        etherealPreviewUrl: sendResult.previewUrl,
        lastError: null,
      });

      logger.info(
        { scheduledEmailId, messageId: sendResult.messageId, previewUrl: sendResult.previewUrl },
        'IN_MEMORY_QUEUE: Email sent successfully via Nodemailer Ethereal SMTP'
      );
    } catch (err: any) {
      logger.error({ scheduledEmailId, error: err.message }, 'IN_MEMORY_QUEUE: Email send failed');
      inMemoryStore.updateScheduledEmail(scheduledEmailId, {
        status: EmailStatus.FAILED,
        lastError: err.message,
      });
    }
  }
}
