import { Router, Request, Response } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { SlackService } from '../integrations/slack/service';
import { config } from '../config';
import { prisma } from '../utils/db';

const router = Router();

// GET /api/slack/connect
router.get('/connect', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const slackAuthUrl = `https://slack.com/oauth/v2/authorize?client_id=${config.SLACK_CLIENT_ID}&scope=chat:write,incoming-webhook&redirect_uri=${encodeURIComponent(config.SLACK_REDIRECT_URI)}&state=${userId}`;
  res.redirect(slackAuthUrl);
});

// GET /api/slack/callback
router.get('/callback', async (req: Request, res: Response) => {
  const code = req.query.code as string;
  const userId = req.query.state as string;

  try {
    if (code && userId) {
      await SlackService.exchangeCodeForToken(code, userId);
    } else {
      // Mock Slack connection for local dev fallback
      const mockUserId = userId || (await prisma.user.findFirst())?.id;
      if (mockUserId) {
        await prisma.slackConnection.upsert({
          where: { userId: mockUserId },
          update: { teamId: 'T123456', teamName: 'ReachInbox Workspace', accessToken: 'xoxb-mock-token' },
          create: { userId: mockUserId, teamId: 'T123456', teamName: 'ReachInbox Workspace', accessToken: 'xoxb-mock-token' },
        });
      }
    }
    res.redirect(`${config.FRONTEND_URL}/dashboard?slack=connected`);
  } catch (err: any) {
    res.redirect(`${config.FRONTEND_URL}/dashboard?slack=error`);
  }
});

// POST /api/slack/mock-connect (Dev helper)
router.post('/mock-connect', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const connection = await prisma.slackConnection.upsert({
    where: { userId },
    update: { teamId: 'T123456', teamName: 'ReachInbox Sales Team', accessToken: 'xoxb-mock-token', channelId: '#outreach-alerts' },
    create: { userId, teamId: 'T123456', teamName: 'ReachInbox Sales Team', accessToken: 'xoxb-mock-token', channelId: '#outreach-alerts' },
  });
  res.json({ success: true, connection });
});

// GET /api/slack/status
router.get('/status', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const status = await SlackService.getSlackStatus(userId);
  res.json(status);
});

// POST /api/slack/disconnect
router.post('/disconnect', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  await SlackService.disconnectSlack(userId);
  res.json({ success: true, message: 'Slack disconnected' });
});

export default router;
