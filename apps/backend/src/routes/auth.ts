import { Router, Request, Response } from 'express';
import axios from 'axios';
import { generateAuthToken, requireAuth } from '../middleware/auth';
import { prisma } from '../utils/db';
import { config } from '../config';
import { logger } from '../utils/logger';

const router = Router();

// GET /api/auth/me
router.get('/me', requireAuth, (req: Request, res: Response) => {
  res.json({ user: req.user });
});

// GET /api/auth/google - Initiate Google OAuth redirect
router.get('/google', (req: Request, res: Response) => {
  const redirectUri = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${config.GOOGLE_CLIENT_ID}&redirect_uri=${encodeURIComponent(config.GOOGLE_CALLBACK_URL)}&response_type=code&scope=openid%20email%20profile`;
  res.redirect(redirectUri);
});

// GET /api/auth/google/callback - Handle OAuth code exchange
router.get('/google/callback', async (req: Request, res: Response) => {
  const code = req.query.code as string;

  if (!code) {
    res.redirect(`${config.FRONTEND_URL}/login?error=no_code`);
    return;
  }

  try {
    let googleUser: { id: string; email: string; name: string; picture?: string };

    if (config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_ID !== 'mock-google-client-id') {
      // 1. Exchange authorization code for tokens with Google
      const tokenRes = await axios.post(
        'https://oauth2.googleapis.com/token',
        new URLSearchParams({
          code,
          client_id: config.GOOGLE_CLIENT_ID,
          client_secret: config.GOOGLE_CLIENT_SECRET,
          redirect_uri: config.GOOGLE_CALLBACK_URL,
          grant_type: 'authorization_code',
        }).toString(),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      );

      const accessToken = tokenRes.data.access_token;

      // 2. Fetch user profile from Google UserInfo API
      const userRes = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      googleUser = {
        id: userRes.data.id,
        email: userRes.data.email,
        name: userRes.data.name || userRes.data.email.split('@')[0],
        picture: userRes.data.picture,
      };
    } else {
      // Fallback for local testing without live Google API keys configured
      googleUser = {
        id: `google-user-${Date.now()}`,
        email: `demo_user_${Date.now()}@reachinbox.ai`,
        name: 'ReachInbox Demo User',
        picture: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
      };
    }

    // 3. Upsert user record in PostgreSQL
    let user = await prisma.user.findFirst({
      where: { OR: [{ googleId: googleUser.id }, { email: googleUser.email }] },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          googleId: googleUser.id,
          email: googleUser.email,
          name: googleUser.name,
          avatarUrl: googleUser.picture || null,
        },
      });
    } else {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          googleId: googleUser.id,
          name: googleUser.name,
          avatarUrl: googleUser.picture || user.avatarUrl,
        },
      });
    }

    // 4. Issue HTTP-only JWT session cookie
    const token = generateAuthToken(user.id, user.email);
    res.cookie('reachinbox_session', token, {
      httpOnly: true,
      secure: config.isProd,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.redirect(`${config.FRONTEND_URL}/dashboard`);
  } catch (err: any) {
    logger.error({ error: err.message }, 'Google OAuth callback exchange error');
    res.redirect(`${config.FRONTEND_URL}/login?error=auth_failed`);
  }
});

// POST /api/auth/dev-login - Easy login endpoint for test / dev environment
router.post('/dev-login', async (req: Request, res: Response) => {
  const { email, name } = req.body;
  const userEmail = email || 'demo@reachinbox.ai';
  const userName = name || 'ReachInbox Demo User';

  let user = await prisma.user.findUnique({ where: { email: userEmail } });

  if (!user) {
    user = await prisma.user.create({
      data: {
        googleId: `google-id-${Date.now()}`,
        name: userName,
        email: userEmail,
        avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
      },
    });
  }

  const token = generateAuthToken(user.id, user.email);
  res.cookie('reachinbox_session', token, {
    httpOnly: true,
    secure: config.isProd,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  res.json({ user, token });
});

// POST /api/auth/logout
router.post('/logout', (req: Request, res: Response) => {
  res.clearCookie('reachinbox_session');
  res.json({ success: true, message: 'Logged out successfully' });
});

export default router;
