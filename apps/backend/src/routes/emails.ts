import { Router, Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { prisma, withDbTimeout } from '../utils/db';
import { inMemoryStore } from '../utils/inMemoryStore';
import { InMemoryQueueService } from '../utils/inMemoryQueue';
import { CsvParserUtil } from '../utils/csvParser';
import { emailQueue } from '../queues/emailQueue';
import { ElasticsearchService } from '../integrations/elasticsearch/client';
import { EmailStatus } from '@reachinbox/shared';
import { logger } from '../utils/logger';

const router = Router();
const upload = multer({ limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB CSV limit

const scheduleEmailSchema = z.object({
  subject: z.string().min(1, 'Subject is required'),
  body: z.string().min(1, 'Body is required'),
  senderId: z.string().min(1, 'Sender is required'),
  startTime: z.string().optional(),
  delayBetweenEmails: z.string().or(z.number()).transform(Number).default(2000),
  hourlyLimit: z.string().or(z.number()).transform(Number).default(200),
  recipients: z.union([z.array(z.string()), z.string()]).optional(),
});

// POST /api/emails/schedule - Single / Bulk Schedule Endpoint
router.post(
  '/schedule',
  requireAuth,
  upload.single('file'),
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.id;
    let recipientList: string[] = [];
    let invalidCount = 0;

    // 1. Handle CSV/TXT file upload if provided
    if (req.file) {
      const parseResult = CsvParserUtil.parseCsvOrText(req.file.buffer);
      recipientList = parseResult.validEmails;
      invalidCount = parseResult.invalidEmails.length;
    } else if (req.body.recipients) {
      try {
        const raw = typeof req.body.recipients === 'string' 
          ? JSON.parse(req.body.recipients) 
          : req.body.recipients;
        recipientList = Array.isArray(raw) ? raw : [raw];
      } catch {
        recipientList = typeof req.body.recipients === 'string' ? [req.body.recipients] : [];
      }
    }

    const body = scheduleEmailSchema.parse(req.body);

    if (recipientList.length === 0) {
      res.status(400).json({ error: 'No valid recipient email addresses provided' });
      return;
    }

    // Deduplicate recipients
    const uniqueRecipients = Array.from(new Set(recipientList.map((e) => e.trim().toLowerCase())));

    // Validate sender ownership
    let sender: any = null;
    try {
      sender = await withDbTimeout(prisma.sender.findFirst({
        where: { id: body.senderId, userId },
      }));
    } catch {
      sender = inMemoryStore.senders.get(body.senderId) || inMemoryStore.getSendersForUser(userId)[0];
    }

    if (!sender) {
      res.status(400).json({ error: 'Selected sender not found' });
      return;
    }

    const parsedTime = body.startTime ? new Date(body.startTime).getTime() : NaN;
    const startDateTime = (!isNaN(parsedTime) && parsedTime > 0) ? new Date(parsedTime) : new Date();
    const startTimeMs = Math.max(Date.now(), startDateTime.getTime());
    const now = Date.now();

    let createdEmails: any[] = [];
    let campaignId = '';

    try {
      // Create EmailCampaign record in DB
      const campaign = await withDbTimeout(prisma.emailCampaign.create({
        data: {
          userId,
          senderId: sender.id,
          subject: body.subject,
          body: body.body,
          startTime: new Date(startTimeMs),
          delayBetweenEmails: body.delayBetweenEmails,
          hourlyLimit: body.hourlyLimit,
        },
      }));
      campaignId = campaign.id;

      const scheduledEmailsToCreate = uniqueRecipients.map((recipient, index) => {
        const scheduledTime = new Date(startTimeMs + index * body.delayBetweenEmails);
        return {
          campaignId: campaign.id,
          userId,
          senderId: sender.id,
          recipient,
          subject: body.subject,
          body: body.body,
          scheduledAt: scheduledTime,
          status: EmailStatus.SCHEDULED,
        };
      });

      await withDbTimeout(prisma.scheduledEmail.createMany({ data: scheduledEmailsToCreate }));

      createdEmails = await withDbTimeout(prisma.scheduledEmail.findMany({
        where: { campaignId: campaign.id },
        orderBy: { scheduledAt: 'asc' },
      }));

      // Add to BullMQ Queue
      const bullJobs = createdEmails.map((email) => ({
        name: 'send-email',
        data: {
          scheduledEmailId: email.id,
          senderId: email.senderId,
          userId: email.userId,
          campaignId: email.campaignId,
        },
        opts: {
          delay: Math.max(0, email.scheduledAt.getTime() - now),
          jobId: `email-${email.id}`,
        },
      }));

      await emailQueue.addBulk(bullJobs);

      // Asynchronously index in ES
      for (const email of createdEmails) {
        ElasticsearchService.indexEmail({
          emailId: email.id,
          campaignId: email.campaignId,
          userId: email.userId,
          senderId: email.senderId,
          recipient: email.recipient,
          subject: email.subject,
          body: email.body,
          status: EmailStatus.SCHEDULED,
          scheduledAt: email.scheduledAt,
          createdAt: email.createdAt,
        });
      }
    } catch (err: any) {
      logger.info('DB/Redis offline, using InMemoryStore & InMemoryQueueService');

      const campaign = inMemoryStore.createCampaign({
        userId,
        senderId: sender.id,
        subject: body.subject,
        body: body.body,
        startTime: new Date(startTimeMs),
        delayBetweenEmails: body.delayBetweenEmails,
        hourlyLimit: body.hourlyLimit,
      });
      campaignId = campaign.id;

      for (let index = 0; index < uniqueRecipients.length; index++) {
        const recipient = uniqueRecipients[index];
        const scheduledTime = new Date(startTimeMs + index * body.delayBetweenEmails);
        const email = inMemoryStore.createScheduledEmail({
          campaignId: campaign.id,
          userId,
          senderId: sender.id,
          recipient,
          subject: body.subject,
          body: body.body,
          scheduledAt: scheduledTime,
          status: EmailStatus.SCHEDULED,
          bullJobId: null,
          attempts: 0,
          lastError: null,
          sentAt: null,
          etherealMessageId: null,
          etherealPreviewUrl: null,
        });
        createdEmails.push(email);

        InMemoryQueueService.enqueueEmailJob({
          scheduledEmailId: email.id,
          senderId: sender.id,
          userId,
          delayMs: Math.max(0, scheduledTime.getTime() - now),
        });
      }
    }

    res.status(201).json({
      campaignId,
      totalRecipients: recipientList.length + invalidCount,
      validRecipients: uniqueRecipients.length,
      invalidRecipients: invalidCount,
      scheduledCount: createdEmails.length,
      scheduledEmails: createdEmails,
    });
  }
);

// GET /api/emails/scheduled
router.get('/scheduled', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  let emails: any[] = [];
  try {
    emails = await withDbTimeout(prisma.scheduledEmail.findMany({
      where: {
        userId,
        status: { in: [EmailStatus.SCHEDULED, EmailStatus.PROCESSING] },
      },
      include: { sender: true },
      orderBy: { scheduledAt: 'asc' },
    }));
  } catch {
    emails = inMemoryStore.getEmailsForUser(userId, [EmailStatus.SCHEDULED, EmailStatus.PROCESSING]);
  }
  res.json({ emails });
});

// GET /api/emails/sent
router.get('/sent', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  let emails: any[] = [];
  try {
    emails = await withDbTimeout(prisma.scheduledEmail.findMany({
      where: {
        userId,
        status: { in: [EmailStatus.SENT, EmailStatus.FAILED, EmailStatus.CANCELLED] },
      },
      include: { sender: true },
      orderBy: { updatedAt: 'desc' },
    }));
  } catch {
    emails = inMemoryStore.getEmailsForUser(userId, [EmailStatus.SENT, EmailStatus.FAILED, EmailStatus.CANCELLED]);
  }
  res.json({ emails });
});

// GET /api/emails/search?q=john
router.get('/search', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const query = (req.query.q as string) || '';
  const status = req.query.status as string;

  let emails: any[] = [];
  try {
    const matchedIds = await ElasticsearchService.searchEmails(userId, query, status);

    if (matchedIds.length > 0) {
      emails = await prisma.scheduledEmail.findMany({
        where: { id: { in: matchedIds } },
        include: { sender: true },
      });
    } else {
      emails = await prisma.scheduledEmail.findMany({
        where: {
          userId,
          ...(status ? { status: status as EmailStatus } : {}),
          ...(query ? {
            OR: [
              { recipient: { contains: query, mode: 'insensitive' } },
              { subject: { contains: query, mode: 'insensitive' } },
              { body: { contains: query, mode: 'insensitive' } },
            ],
          } : {}),
        },
        include: { sender: true },
        orderBy: { scheduledAt: 'desc' },
        take: 100,
      });
    }
  } catch {
    emails = inMemoryStore.searchEmails(userId, query, status);
  }

  res.json({ emails });
});

// GET /api/emails/:id
router.get('/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const { id } = req.params;

  let email: any = null;
  try {
    email = await withDbTimeout(prisma.scheduledEmail.findFirst({
      where: { id, userId },
      include: { sender: true, campaign: true },
    }));
  } catch {
    email = inMemoryStore.scheduledEmails.get(id) || null;
  }

  if (!email) {
    res.status(404).json({ error: 'Email not found' });
    return;
  }

  res.json({ email });
});

// POST /api/emails/:id/cancel
router.post('/:id/cancel', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const { id } = req.params;

  let email: any = null;
  try {
    email = await withDbTimeout(prisma.scheduledEmail.findFirst({ where: { id, userId } }));
  } catch {
    email = inMemoryStore.scheduledEmails.get(id) || null;
  }

  if (!email) {
    res.status(404).json({ error: 'Email not found' });
    return;
  }

  if (email.status === EmailStatus.SENT) {
    res.status(400).json({ error: 'Cannot cancel an email that has already been sent' });
    return;
  }

  let updated: any = null;
  try {
    updated = await withDbTimeout(prisma.scheduledEmail.update({
      where: { id },
      data: { status: EmailStatus.CANCELLED },
    }));
    const job = await emailQueue.getJob(`email-${id}`);
    if (job) await job.remove();
  } catch {
    updated = inMemoryStore.updateScheduledEmail(id, { status: EmailStatus.CANCELLED });
  }

  res.json({ success: true, email: updated });
});

export default router;
