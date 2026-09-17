import { parse } from 'csv-parse/sync';
import { ParseCsvResult } from '@reachinbox/shared';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class CsvParserUtil {
  /**
   * Intelligently parses CSV or plain text content to extract valid, invalid, and duplicate emails.
   */
  public static parseCsvOrText(fileBuffer: Buffer): ParseCsvResult {
    // Strip UTF-8 BOM (\uFEFF) if present
    const rawContent = fileBuffer.toString('utf-8').replace(/^\uFEFF/, '');
    let rows: string[][] = [];

    try {
      rows = parse(rawContent, {
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true,
      });
    } catch (err) {
      // Fallback: split line by line if raw CSV parsing fails
      rows = rawContent
        .split(/\r?\n/)
        .map((line) => line.split(',').map((c) => c.trim()))
        .filter((row) => row.some((c) => c.length > 0));
    }

    if (rows.length === 0) {
      return { totalRows: 0, validEmails: [], invalidEmails: [], duplicateEmails: [] };
    }

    // Determine header row / email column index
    let emailColIndex = 0;
    const header = rows[0];
    const headerMatchIndex = header.findIndex((cell) =>
      /^(email|e-mail|recipient|mail|to|email_address|contact_email)$/i.test(cell.trim())
    );

    if (headerMatchIndex !== -1) {
      emailColIndex = headerMatchIndex;
      rows = rows.slice(1); // Exclude header row
    }

    const seen = new Set<string>();
    const validEmails: string[] = [];
    const invalidEmails: string[] = [];
    const duplicateEmails: string[] = [];
    let totalRows = 0;

    for (const row of rows) {
      // Find candidate email in row
      let candidate = row[emailColIndex]?.trim();

      if (!candidate || !EMAIL_REGEX.test(candidate)) {
        // Search across all cells in row for a valid email pattern
        const foundInRow = row.find((cell) => EMAIL_REGEX.test(cell.trim()));
        if (foundInRow) {
          candidate = foundInRow.trim();
        }
      }

      if (!candidate) {
        continue;
      }

      totalRows++;

      if (!EMAIL_REGEX.test(candidate)) {
        invalidEmails.push(candidate);
      } else {
        const lower = candidate.toLowerCase();
        if (seen.has(lower)) {
          duplicateEmails.push(lower);
        } else {
          seen.add(lower);
          validEmails.push(lower);
        }
      }
    }

    return {
      totalRows,
      validEmails,
      invalidEmails,
      duplicateEmails,
    };
  }
}
