import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { prisma } from '../utils/db';
import { logger } from '../utils/logger';
import { inMemoryStore } from '../utils/inMemoryStore';

export interface UserPayload {
  id: string;
  googleId: string;
  name: string;
  email: string;
  avatarUrl: string | null;
}

declare global {
  namespace Express {
    interface Request {
      user?: UserPayload;
    }
  }
}

export type AuthenticatedRequest = Request;

export const generateAuthToken = (userId: string, email: string): string => {
  return jwt.sign({ userId, email }, config.SESSION_SECRET, { expiresIn: '7d' });
};

export const requireAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // 1. Check HTTP-only cookie or Bearer header
    let token = req.cookies?.reachinbox_session;

    if (!token && req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (token) {
      try {
        const decoded = jwt.verify(token, config.SESSION_SECRET) as { userId: string; email: string };
        let user = null;
        try {
          user = await prisma.user.findUnique({ where: { id: decoded.userId } });
        } catch {
          user = inMemoryStore.findUserById(decoded.userId) || inMemoryStore.findUserByEmail(decoded.email);
        }

        if (user) {
          req.user = {
            id: user.id,
            googleId: user.googleId,
            name: user.name,
            email: user.email,
            avatarUrl: user.avatarUrl,
          };
          return next();
        }
      } catch (jwtErr) {
        // Token invalid, proceed to dev fallback check
      }
    }

    // 2. Dev / Test fallback mode
    const devEmail = (req.headers['x-dev-user-email'] as string) || 'demo@reachinbox.ai';
    if (!config.isProd || req.headers['x-dev-user-email']) {
      let user = null;
      try {
        user = await prisma.user.findUnique({ where: { email: devEmail } });
        if (!user) {
          user = await prisma.user.create({
            data: {
              googleId: `dev-google-${Date.now()}`,
              name: 'ReachInbox Demo User',
              email: devEmail,
              avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
            },
          });
        }
      } catch {
        user = inMemoryStore.findUserByEmail(devEmail);
        if (!user) {
          user = inMemoryStore.createUser({
            googleId: `dev-google-${Date.now()}`,
            name: 'ReachInbox Demo User',
            email: devEmail,
            avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
          });
        }
      }

      req.user = {
        id: user.id,
        googleId: user.googleId,
        name: user.name,
        email: user.email,
        avatarUrl: user.avatarUrl,
      };
      return next();
    }

    res.status(401).json({ error: 'Unauthorized: Authentication required' });
  } catch (err: any) {
    logger.error({ error: err.message }, 'Authentication middleware failure');
    res.status(401).json({ error: 'Unauthorized' });
  }
};
