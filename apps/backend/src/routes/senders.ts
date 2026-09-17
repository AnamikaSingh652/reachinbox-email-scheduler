import { Router, Response } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { prisma } from '../utils/db';
import { EtherealEmailService } from '../integrations/email/ethereal';
import { z } from 'zod';

const router = Router();

const createSenderSchema = z.object({
  name: z.string().min(1, 'Sender name is required'),
  email: z.string().email('Invalid email address'),
  etherealUser: z.string().optional(),
  etherealPassword: z.string().optional(),
});

// GET /api/senders
router.get('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  let senders = await prisma.sender.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });

  // Ensure default sender exists for seamless onboarding
  if (senders.length === 0) {
    const acc = await EtherealEmailService.createEtherealAccount();
    const defaultSender = await prisma.sender.create({
      data: {
        userId,
        name: 'Default Outreach Sender',
        email: acc.user,
        etherealUser: acc.user,
        etherealPassword: acc.pass,
      },
    });
    senders = [defaultSender];
  }

  res.json({ senders });
});

// POST /api/senders
router.post('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const body = createSenderSchema.parse(req.body);

  let etherealUser = body.etherealUser;
  let etherealPassword = body.etherealPassword;

  if (!etherealUser || !etherealPassword) {
    const acc = await EtherealEmailService.createEtherealAccount();
    etherealUser = acc.user;
    etherealPassword = acc.pass;
  }

  const sender = await prisma.sender.create({
    data: {
      userId,
      name: body.name,
      email: body.email,
      etherealUser,
      etherealPassword,
    },
  });

  res.status(201).json({ sender });
});

// DELETE /api/senders/:id
router.delete('/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const { id } = req.params;

  await prisma.sender.deleteMany({
    where: { id, userId },
  });

  res.json({ success: true, message: 'Sender deleted' });
});

export default router;
