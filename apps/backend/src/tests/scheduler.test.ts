import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CsvParserUtil } from '../utils/csvParser';
import { DistributedRateLimiter } from '../services/rateLimiter';
import { EmailStatus } from '@reachinbox/shared';

describe('Email Scheduler & Rate Limiter Logic Tests', () => {
  it('should parse CSV with headers and deduplicate valid emails', () => {
    const csvData = `email,name
john@example.com,John Doe
alice@domain.com,Alice
john@example.com,John Duplicate
invalid-email-address,Bad Row
`;
    const result = CsvParserUtil.parseCsvOrText(Buffer.from(csvData));
    expect(result.validEmails).toEqual(['john@example.com', 'alice@domain.com']);
    expect(result.duplicateEmails).toEqual(['john@example.com']);
    expect(result.invalidEmails).toEqual(['invalid-email-address']);
  });

  it('should calculate UTC hour window string correctly', () => {
    const d = new Date('2026-09-16T14:35:12.000Z');
    const windowKey = DistributedRateLimiter.getHourWindowKey(d);
    expect(windowKey).toBe('2026-09-16-14');
  });

  it('should calculate remaining time until next UTC hour window', () => {
    const d = new Date('2026-09-16T14:45:00.000Z');
    const msUntilNext = DistributedRateLimiter.getMsUntilNextHour(d);
    // 15 minutes = 900,000 ms
    expect(msUntilNext).toBe(15 * 60 * 1000);
  });

  it('should support EmailStatus enum transitions', () => {
    const statusMap = {
      scheduled: EmailStatus.SCHEDULED,
      processing: EmailStatus.PROCESSING,
      sent: EmailStatus.SENT,
      failed: EmailStatus.FAILED,
      cancelled: EmailStatus.CANCELLED,
    };
    expect(statusMap.scheduled).toBe('scheduled');
    expect(statusMap.sent).toBe('sent');
  });
});
