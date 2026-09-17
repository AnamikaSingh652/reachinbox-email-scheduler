import axios from 'axios';
import { config } from '../../config';
import { logger } from '../../utils/logger';
import { prisma } from '../../utils/db';
import { redis } from '../../utils/redis';
import { DistributedRateLimiter } from '../../services/rateLimiter';

export class SlackService {
  /**
   * Exchanges Slack OAuth code for an access token.
   */
  public static async exchangeCodeForToken(code: string, userId: string) {
    try {
      const response = await axios.post(
        'https://slack.com/api/oauth.v2.access',
        new URLSearchParams({
          client_id: config.SLACK_CLIENT_ID,
          client_secret: config.SLACK_CLIENT_SECRET,
          code,
          redirect_uri: config.SLACK_REDIRECT_URI,
        }).toString(),
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        }
      );

      if (!response.data.ok) {
        throw new Error(response.data.error || 'Slack OAuth token exchange failed');
      }

      const { access_token, team, incoming_webhook } = response.data;
      const channelId = incoming_webhook?.channel_id || null;

      const connection = await prisma.slackConnection.upsert({
        where: { userId },
        update: {
          teamId: team.id,
          teamName: team.name,
          accessToken: access_token,
          channelId,
        },
        create: {
          userId,
          teamId: team.id,
          teamName: team.name,
          accessToken: access_token,
          channelId,
        },
      });

      logger.info({ userId, teamName: team.name }, 'Successfully connected Slack account');
      return connection;
    } catch (err: any) {
      logger.error({ error: err.message }, 'Failed to exchange Slack OAuth code');
      throw err;
    }
  }

  /**
   * Disconnects Slack connection for a user.
   */
  public static async disconnectSlack(userId: string): Promise<void> {
    await prisma.slackConnection.deleteMany({
      where: { userId },
    });
    logger.info({ userId }, 'Disconnected Slack account');
  }

  /**
   * Gets Slack connection status for a user.
   */
  public static async getSlackStatus(userId: string) {
    const conn = await prisma.slackConnection.findUnique({
      where: { userId },
    });
    return {
      isConnected: !!conn,
      teamName: conn?.teamName || null,
      channelId: conn?.channelId || null,
    };
  }

  /**
   * Sends hourly rate limit alert to Slack with deduplication check.
   */
  public static async notifyRateLimitReached(params: {
    userId: string;
    senderEmail: string;
    senderId: string;
    limit: number;
  }): Promise<boolean> {
    const { userId, senderEmail, senderId, limit } = params;
    const hourWindow = DistributedRateLimiter.getHourWindowKey();
    const dedupKey = `slack-rate-limit-notified:${senderId}:${hourWindow}`;

    try {
      // Deduplication check using Redis SETNX with 1-hour TTL
      const isSet = await redis.set(dedupKey, '1', 'EX', 3600, 'NX');
      if (!isSet) {
        logger.info({ senderId, hourWindow }, 'Slack rate limit notification already sent for this hour window');
        return false;
      }

      const connection = await prisma.slackConnection.findUnique({
        where: { userId },
      });

      if (!connection) {
        logger.info({ userId }, 'No Slack connection found for user; skipping notification');
        return false;
      }

      const messageText = `⚠️ *ReachInbox Email Limit Exceeded*\n\nRate limit reached for sender \`${senderEmail}\`.\n*${limit} emails* have been sent in the current hour window.\nRemaining emails have been automatically deferred to the next available window.`;

      // Post message to Slack channel using Web API
      await axios.post(
        'https://slack.com/api/chat.postMessage',
        {
          channel: connection.channelId || '#general',
          text: messageText,
        },
        {
          headers: {
            Authorization: `Bearer ${connection.accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      logger.info({ senderEmail, userId }, 'SLACK_RATE_LIMIT_NOTIFICATION_SENT');
      return true;
    } catch (err: any) {
      logger.warn({ error: err.message, senderEmail }, 'Slack rate limit notification failed gracefully');
      return false;
    }
  }
}
