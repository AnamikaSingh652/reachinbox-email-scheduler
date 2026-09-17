import { Router, Response } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { ElasticsearchService } from '../integrations/elasticsearch/client';

const router = Router();

// POST /api/admin/emails/reindex
router.post('/emails/reindex', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await ElasticsearchService.reindexAll();
    res.json({
      success: true,
      message: `Reindexed ${result.count} email documents into Elasticsearch`,
      count: result.count,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Reindex failed' });
  }
});

export default router;
