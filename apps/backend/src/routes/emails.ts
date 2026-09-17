import { Router, Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { prisma } from '../utils/db';
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
  recipients: z.array(z.string()).optional(),
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
      const raw = typeof req.body.recipients === 'string' 
        ? JSON.parse(req.body.recipients) 
        : req.body.recipients;
      recipientList = Array.isArray(raw) ? raw : [raw];
    }

    const body = scheduleEmailSchema.parse(req.body);

    if (recipientList.length === 0) {
      res.status(400).json({ error: 'No valid recipient email addresses provided' });
      return;
    }

    // Deduplicate recipients
    const uniqueRecipients = Array.from(new Set(recipientList.map((e) => e.trim().toLowerCase())));

    // Validate sender ownership
    const sender = await prisma.sender.findFirst({
      where: { id: body.senderId, userId },
    });

    if (!sender) {
      res.status(400).json({ error: 'Selected sender not found' });
      return;
    }

    const startDateTime = body.startTime ? new Date(body.startTime) : new Date();
    const startTimeMs = Math.max(Date.now(), startDateTime.getTime());

    // 2. Create EmailCampaign record
    const campaign = await prisma.emailCampaign.create({
      data: {
        userId,
        senderId: sender.id,
        subject: body.subject,
        body: body.body,
        startTime: new Date(startTimeMs),
        delayBetweenEmails: body.delayBetweenEmails,
        hourlyLimit: body.hourlyLimit,
      },
    });

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

    // 3. Batch insert scheduled_emails records into PostgreSQL
    await prisma.scheduledEmail.createMany({
      data: scheduledEmailsToCreate,
    });

    const createdEmails = await prisma.scheduledEmail.findMany({
      where: { campaignId: campaign.id },
      orderBy: { scheduledAt: 'asc' },
    });

    // 4. Batch create BullMQ delayed jobs in Redis
    const now = Date.now();
    const bullJobs = createdEmails.map((email) => {
      const delay = Math.max(0, email.scheduledAt.getTime() - now);
      return {
        name: 'send-email',
        data: {
          scheduledEmailId: email.id,
          senderId: email.senderId,
          userId: email.userId,
          campaignId: email.campaignId,
        },
        opts: {
          delay,
          jobId: `email-${email.id}`,
        },
      };
    });

    await emailQueue.addBulk(bullJobs);

    // 5. Index in Elasticsearch asynchronously
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

    logger.info(
      { campaignId: campaign.id, count: createdEmails.length, userId },
      'Successfully scheduled bulk email campaign'
    );

    res.status(201).json({
      campaignId: campaign.id,
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
  const emails = await prisma.scheduledEmail.findMany({
    where: {
      userId,
      status: { in: [EmailStatus.SCHEDULED, EmailStatus.PROCESSING] },
    },
    include: { sender: true },
    orderBy: { scheduledAt: 'asc' },
  });
  res.json({ emails });
});

// GET /api/emails/sent
router.get('/sent', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const emails = await prisma.scheduledEmail.findMany({
    where: {
      userId,
      status: { in: [EmailStatus.SENT, EmailStatus.FAILED, EmailStatus.CANCELLED] },
    },
    include: { sender: true },
    orderBy: { updatedAt: 'desc' },
  });
  res.json({ emails });
});

// GET /api/emails/search?q=john
router.get('/search', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const query = (req.query.q as string) || '';
  const status = req.query.status as string;

  // Query Elasticsearch for matching email IDs
  const matchedIds = await ElasticsearchService.searchEmails(userId, query, status);

  let emails;
  if (matchedIds.length > 0) {
    emails = await prisma.scheduledEmail.findMany({
      where: { id: { in: matchedIds } },
      include: { sender: true },
    });
  } else {
    // Fallback search in PostgreSQL if ES returns empty or unavailable
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

  res.json({ emails });
});

// GET /api/emails/:id
router.get('/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const { id } = req.params;

  const email = await prisma.scheduledEmail.findFirst({
    where: { id, userId },
    include: { sender: true, campaign: true },
  });

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

  const email = await prisma.scheduledEmail.findFirst({
    where: { id, userId },
  });

  if (!email) {
    res.status(404).json({ error: 'Email not found' });
    return;
  }

  if (email.status === EmailStatus.SENT) {
    res.status(400).json({ error: 'Cannot cancel an email that has already been sent' });
    return;
  }

  const updated = await prisma.scheduledEmail.update({
    where: { id },
    data: { status: EmailStatus.CANCELLED },
  });

  // Try removing BullMQ job if present
  try {
    const job = await emailQueue.getJob(`email-${id}`);
    if (job) {
      await job.remove();
    }
  } catch (err) {
    logger.warn({ id }, 'Failed to remove job from BullMQ queue during cancellation');
  }

  res.json({ success: true, email: updated });
});

export default router;
