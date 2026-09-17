# ReachInbox System Architecture & Engineering Trade-offs

## Distributed Architecture Overview

```
+-----------------------------------------------------------------------------------+
|                                 React Dashboard                                   |
|             (Vite + TypeScript + Tailwind CSS + Lucide + Sonner)                  |
+------------------------------------------+----------------------------------------+
                                           | HTTP / REST (JWT Cookie)
                                           v
+-----------------------------------------------------------------------------------+
|                                  Express.js API                                   |
|              (Auth, Schedulers, Senders, Campaigns, Slack, Admin)                 |
+------------------+-----------------------+----------------------+-----------------+
                   |                       |                      |
                   v                       v                      v
        +---------------------+  +-------------------+  +-------------------+
        | PostgreSQL (Prisma) |  |   BullMQ Queue    |  |   Elasticsearch   |
        |  (Source of Truth)  |  |    (Bull-Board)   |  |   (Search Index)  |
        +---------------------+  +---------+---------+  +-------------------+
                                           |
                                           v
                                 +-------------------+
                                 |  BullMQ Worker    |
                                 | (Rate Limiter,    |
                                 |  Distributed Delay|
                                 |  Idempotency Lock)|
                                 +---------+---------+
                                           |
                    +----------------------+----------------------+
                    |                                             |
                    v                                             v
        +-----------------------+                     +-----------------------+
        |  Ethereal SMTP Engine |                     | Slack Web API Engine  |
        |  (Real Nodemailer)    |                     | (Hourly Notification) |
        +-----------------------+                     +-----------------------+
```

## Key Mechanisms

### 1. Atomic DB State Transitions & Idempotency
- Prevents double-sending emails when multiple concurrent workers execute.
- Database query:
  `UPDATE scheduled_emails SET status='processing', attempts=attempts+1 WHERE id=? AND status IN ('scheduled', 'failed')`
- If 0 rows updated, another worker already owns the task.

### 2. Distributed Rate Limiting (Redis Lua)
- Atomic script evaluates sender's current hourly sending quota using key `rate:{senderId}:{YYYY-MM-DD-HH}`.
- If counter exceeds limit (default `200/hr`), the job is automatically moved to delayed state (`moveToDelayed`) targeting the exact millisecond of the next UTC hour window.

### 3. Distributed Minimum Delay Enforcement
- Minimum delay per sender (default `2000ms`) stored in Redis key `email:sender:{senderId}:last-send`.
- If worker attempts early, calculates remaining ms and reschedules job via `moveToDelayed(now + remainingMs)`.

### 4. Slack Alert Deduplication
- Deduplicated via Redis key `slack-rate-limit-notified:{senderId}:{hourWindow}` with a 1-hour TTL using `SETNX`.
- Ensures max 1 alert per sender per hour.
