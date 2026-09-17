import { describe, it, expect, vi } from 'vitest';
import { CsvParserUtil } from '../utils/csvParser';
import { DistributedRateLimiter } from '../services/rateLimiter';

describe('Deep Lifecycle & Security Tests', () => {
  it('should parse CSV with UTF-8 BOM characters correctly', () => {
    // Add UTF-8 BOM \uFEFF to header
    const bomCsv = `\uFEFFemail,name
john.bom@example.com,John BOM
alice.bom@example.com,Alice BOM
`;
    const result = CsvParserUtil.parseCsvOrText(Buffer.from(bomCsv));
    expect(result.validEmails).toEqual(['john.bom@example.com', 'alice.bom@example.com']);
  });

  it('should format rate limiter key using UTC hour window string', () => {
    const d = new Date('2026-09-16T23:59:59.000Z');
    const window = DistributedRateLimiter.getHourWindowKey(d);
    expect(window).toBe('2026-09-16-23');
  });

  it('should return correct milliseconds until next hour window at midnight boundary', () => {
    const d = new Date('2026-09-16T23:50:00.000Z');
    const msUntilNext = DistributedRateLimiter.getMsUntilNextHour(d);
    // 10 minutes = 600,000 ms
    expect(msUntilNext).toBe(10 * 60 * 1000);
  });
});
