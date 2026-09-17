import { Router, Response } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { prisma } from '../utils/db';

const router = Router();

// GET /api/campaigns
router.get('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const campaigns = await prisma.emailCampaign.findMany({
    where: { userId },
    include: {
      sender: true,
      _count: {
        select: { scheduledEmails: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ campaigns });
});

// GET /api/campaigns/:id
router.get('/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const { id } = req.params;

  const campaign = await prisma.emailCampaign.findFirst({
    where: { id, userId },
    include: {
      sender: true,
      scheduledEmails: {
        orderBy: { scheduledAt: 'asc' },
      },
    },
  });

  if (!campaign) {
    res.status(404).json({ error: 'Campaign not found' });
    return;
  }

  res.json({ campaign });
});

export default router;
