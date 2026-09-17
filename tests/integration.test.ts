import { describe, it, expect } from 'vitest';
import { CsvParserUtil } from '../apps/backend/src/utils/csvParser';
import { DistributedRateLimiter } from '../apps/backend/src/services/rateLimiter';

describe('Monorepo E2E Integration Suite', () => {
  it('verifies CSV parsing and email extraction integrity', () => {
    const sampleCsv = `name,email,role
John,john.outreach@company.org,Sales Lead
Jane,jane.outreach@company.org,Dev
`;
    const result = CsvParserUtil.parseCsvOrText(Buffer.from(sampleCsv));
    expect(result.validEmails).toContain('john.outreach@company.org');
    expect(result.validEmails).toContain('jane.outreach@company.org');
  });

  it('verifies rate limit hour window key calculations', () => {
    const testDate = new Date('2026-09-17T15:00:00.000Z');
    const key = DistributedRateLimiter.getHourWindowKey(testDate);
    expect(key).toBe('2026-09-17-15');
  });
});
