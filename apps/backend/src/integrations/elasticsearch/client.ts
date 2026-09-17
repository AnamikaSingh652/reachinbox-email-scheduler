import { Client } from '@elastic/elasticsearch';
import { config } from '../../config';
import { logger } from '../../utils/logger';
import { prisma } from '../../utils/db';

export const INDEX_NAME = 'emails';

export const esClient = new Client({
  node: config.ELASTICSEARCH_URL,
  maxRetries: 3,
  requestTimeout: 5000,
});

export class ElasticsearchService {
  /**
   * Initializes the `emails` index with proper field mappings.
   */
  public static async initIndex(): Promise<void> {
    try {
      const exists = await esClient.indices.exists({ index: INDEX_NAME });
      if (!exists) {
        await esClient.indices.create({
          index: INDEX_NAME,
          mappings: {
            properties: {
              emailId: { type: 'keyword' },
              campaignId: { type: 'keyword' },
              userId: { type: 'keyword' },
              senderId: { type: 'keyword' },
              recipient: { type: 'text', fields: { keyword: { type: 'keyword' } } },
              subject: { type: 'text' },
              body: { type: 'text' },
              status: { type: 'keyword' },
              scheduledAt: { type: 'date' },
              sentAt: { type: 'date' },
              createdAt: { type: 'date' },
            },
          },
        });
        logger.info({ index: INDEX_NAME }, 'Created Elasticsearch index');
      }
    } catch (err: any) {
      logger.warn({ error: err.message }, 'Elasticsearch initIndex failed or service unavailable');
    }
  }

  /**
   * Indexes a single email document into Elasticsearch.
   */
  public static async indexEmail(emailDoc: {
    emailId: string;
    campaignId: string | null;
    userId: string;
    senderId: string;
    recipient: string;
    subject: string;
    body: string;
    status: string;
    scheduledAt: Date | string;
    sentAt?: Date | string | null;
    createdAt: Date | string;
  }): Promise<void> {
    try {
      await esClient.index({
        index: INDEX_NAME,
        id: emailDoc.emailId,
        document: {
          ...emailDoc,
          scheduledAt: new Date(emailDoc.scheduledAt).toISOString(),
          sentAt: emailDoc.sentAt ? new Date(emailDoc.sentAt).toISOString() : null,
          createdAt: new Date(emailDoc.createdAt).toISOString(),
        },
      });
      logger.info({ emailId: emailDoc.emailId }, 'Indexed email document in Elasticsearch');
    } catch (err: any) {
      logger.warn({ error: err.message, emailId: emailDoc.emailId }, 'Elasticsearch index failed gracefully');
    }
  }

  /**
   * Performs search over recipient, subject, and body fields in Elasticsearch.
   */
  public static async searchEmails(
    userId: string,
    queryText: string,
    statusFilter?: string
  ): Promise<string[]> {
    try {
      const mustClauses: any[] = [{ term: { userId } }];

      if (statusFilter) {
        mustClauses.push({ term: { status: statusFilter } });
      }

      if (queryText && queryText.trim().length > 0) {
        mustClauses.push({
          multi_match: {
            query: queryText.trim(),
            fields: ['recipient^3', 'subject^2', 'body'],
            fuzziness: 'AUTO',
          },
        });
      }

      const result = await esClient.search({
        index: INDEX_NAME,
        query: {
          bool: {
            must: mustClauses,
          },
        },
        size: 100,
      });

      const hits = result.hits.hits;
      return hits.map((hit: any) => hit._id);
    } catch (err: any) {
      logger.warn({ error: err.message }, 'Elasticsearch search query failed, falling back to DB query');
      return [];
    }
  }

  /**
   * Reindexes all scheduled and sent emails from PostgreSQL into Elasticsearch.
   */
  public static async reindexAll(): Promise<{ count: number }> {
    try {
      await this.initIndex();

      const emails = await prisma.scheduledEmail.findMany();
      if (emails.length === 0) {
        return { count: 0 };
      }

      const operations = emails.flatMap((email) => [
        { index: { _index: INDEX_NAME, _id: email.id } },
        {
          emailId: email.id,
          campaignId: email.campaignId,
          userId: email.userId,
          senderId: email.senderId,
          recipient: email.recipient,
          subject: email.subject,
          body: email.body,
          status: email.status,
          scheduledAt: email.scheduledAt.toISOString(),
          sentAt: email.sentAt ? email.sentAt.toISOString() : null,
          createdAt: email.createdAt.toISOString(),
        },
      ]);

      const bulkResponse = await esClient.bulk({ refresh: true, operations });
      logger.info({ count: emails.length, errors: bulkResponse.errors }, 'Bulk reindexed emails into Elasticsearch');
      return { count: emails.length };
    } catch (err: any) {
      logger.error({ error: err.message }, 'Bulk reindex failed');
      throw err;
    }
  }
}
