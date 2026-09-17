import { Router, Response } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { prisma, withDbTimeout } from '../utils/db';
import { inMemoryStore } from '../utils/inMemoryStore';

const router = Router();

// GET /api/campaigns
router.get('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  let campaigns: any[] = [];
  try {
    campaigns = await withDbTimeout(prisma.emailCampaign.findMany({
      where: { userId },
      include: {
        sender: true,
        _count: {
          select: { scheduledEmails: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    }));
  } catch {
    campaigns = inMemoryStore.getCampaignsForUser(userId);
  }
  res.json({ campaigns });
});

// GET /api/campaigns/:id
router.get('/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const { id } = req.params;

  let campaign: any = null;
  try {
    campaign = await withDbTimeout(prisma.emailCampaign.findFirst({
      where: { id, userId },
      include: {
        sender: true,
        scheduledEmails: {
          orderBy: { scheduledAt: 'asc' },
        },
      },
    }));
  } catch {
    campaign = inMemoryStore.campaigns.get(id) || null;
  }

  if (!campaign) {
    res.status(404).json({ error: 'Campaign not found' });
    return;
  }

  res.json({ campaign });
});

export default router;
