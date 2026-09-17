import { redis } from '../utils/redis';
import { logger } from '../utils/logger';

// Lua script for atomic hourly rate limit check and increment
const HOURLY_RATE_LIMIT_LUA = `
local key = KEYS[1]
local limit = tonumber(ARGV[1])
local ttl = tonumber(ARGV[2])

local current = redis.call("GET", key)
if current and tonumber(current) >= limit then
  return -1
end

local count = redis.call("INCR", key)
if count == 1 then
  redis.call("EXPIRE", key, ttl)
end
return count
`;

// Lua script for atomic minimum delay check and send slot reservation
const MIN_DELAY_LUA = `
local key = KEYS[1]
local minDelayMs = tonumber(ARGV[1])
local now = tonumber(ARGV[2])

local lastSend = redis.call("GET", key)
if lastSend then
  local elapsed = now - tonumber(lastSend)
  if elapsed < minDelayMs then
    return minDelayMs - elapsed
  end
end

-- Atomically reserve send slot
redis.call("SET", key, now, "PX", minDelayMs * 10)
return 0
`;

export interface RateLimitCheckResult {
  allowed: boolean;
  currentCount: number;
  limit: number;
  nextAvailableWindowMs?: number;
}

export class DistributedRateLimiter {
  /**
   * Helper to format UTC hour window string YYYY-MM-DD-HH
   */
  public static getHourWindowKey(date: Date = new Date()): string {
    const yyyy = date.getUTCFullYear();
    const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(date.getUTCDate()).padStart(2, '0');
    const hh = String(date.getUTCHours()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}-${hh}`;
  }

  /**
   * Calculates milliseconds remaining until the start of the next UTC hour window.
   */
  public static getMsUntilNextHour(date: Date = new Date()): number {
    const nextHour = new Date(date);
    nextHour.setUTCHours(nextHour.getUTCHours() + 1, 0, 0, 0);
    return Math.max(1000, nextHour.getTime() - date.getTime());
  }

  /**
   * Atomically checks and increments hourly email count for a sender.
   */
  public static async checkAndIncrementHourlyLimit(
    senderId: string,
    hourlyLimit: number
  ): Promise<RateLimitCheckResult> {
    const now = new Date();
    const window = this.getHourWindowKey(now);
    const key = `rate:${senderId}:${window}`;
    const ttlSeconds = 3700; // slightly over 1 hour

    try {
      const result = (await redis.eval(
        HOURLY_RATE_LIMIT_LUA,
        1,
        key,
        hourlyLimit.toString(),
        ttlSeconds.toString()
      )) as number;

      if (result === -1) {
        const msUntilNext = this.getMsUntilNextHour(now);
        logger.info(
          { senderId, hourlyLimit, msUntilNext },
          'Hourly rate limit reached for sender'
        );
        return {
          allowed: false,
          currentCount: hourlyLimit,
          limit: hourlyLimit,
          nextAvailableWindowMs: msUntilNext,
        };
      }

      return {
        allowed: true,
        currentCount: result,
        limit: hourlyLimit,
      };
    } catch (err: any) {
      logger.warn({ error: err.message }, 'Redis rate limiter check failed, falling back to allowed');
      return { allowed: true, currentCount: 1, limit: hourlyLimit };
    }
  }

  /**
   * Atomically checks if minimum delay has elapsed AND reserves the send slot in Redis.
   * Prevents race conditions between concurrent workers.
   */
  public static async reserveSenderSendSlot(
    senderId: string,
    minDelayMs: number
  ): Promise<{ allowed: boolean; remainingDelayMs: number }> {
    const key = `email:sender:${senderId}:last-send`;
    const now = Date.now();

    try {
      const result = (await redis.eval(
        MIN_DELAY_LUA,
        1,
        key,
        minDelayMs.toString(),
        now.toString()
      )) as number;

      if (result > 0) {
        return { allowed: false, remainingDelayMs: result };
      }

      return { allowed: true, remainingDelayMs: 0 };
    } catch (err: any) {
      logger.warn({ error: err.message }, 'Redis minimum delay check failed, allowing send fallback');
      return { allowed: true, remainingDelayMs: 0 };
    }
  }

  /**
   * Updates last send timestamp for a sender in Redis.
   */
  public static async updateSenderLastSend(senderId: string): Promise<void> {
    const key = `email:sender:${senderId}:last-send`;
    const now = Date.now();
    try {
      await redis.set(key, now.toString(), 'PX', 86400000);
    } catch (err: any) {
      logger.warn({ error: err.message }, 'Failed to update sender last send timestamp');
    }
  }
}
