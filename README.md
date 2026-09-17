# ReachInbox.ai - Production-Grade Full-Stack Email Scheduler

A high-performance, resilient, production-grade full-stack email scheduler built with **Node.js, Express, TypeScript, BullMQ, Redis, PostgreSQL (Prisma), Nodemailer (Ethereal SMTP), Elasticsearch, React 18, and Tailwind CSS**.

Designed specifically for the ReachInbox.ai / Outbox Labs hiring assignment, this application solves complex distributed email outreach challenges: persistent delayed queueing, worker restart recovery, atomic row-level idempotency, multi-worker distributed rate limiting, and real-time Elasticsearch search.

---

## 🏗 System Architecture

```
+-----------------------------------------------------------------------------------+
|                                 React Dashboard                                   |
|               (Vite + TypeScript + Tailwind CSS + Lucide Icons)                   |
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

---

## 🌟 Key Features

1. **Reliable Delayed Queueing**: BullMQ + Redis stores scheduled jobs durably. Survives worker and server restarts without job loss.
2. **PostgreSQL Source of Truth**: All campaigns, scheduled email records, user accounts, and status transitions are stored in PostgreSQL via Prisma ORM.
3. **Atomic Row-Level Idempotency**: Prevents duplicate email delivery. Only a worker that executes an atomic `scheduled -> processing` update is permitted to dispatch SMTP requests.
4. **Distributed Hourly Rate Limiting**: Atomic Redis Lua script counter (`rate:{senderId}:{YYYY-MM-DD-HH}`). Automatically reschedules jobs to the next hour window when limit (`MAX_EMAILS_PER_HOUR_PER_SENDER=200`) is reached.
5. **Distributed Minimum Delay Enforcement**: Ensures `MIN_DELAY_BETWEEN_EMAILS_MS` (e.g. `2000ms`) is strictly observed across concurrent workers using Redis timestamp keys (`email:sender:{senderId}:last-send`).
6. **Ethereal SMTP Integration**: Real Nodemailer email sending with auto-generated test accounts and instant Ethereal preview URLs.
7. **Elasticsearch Indexing & Search**: Search emails instantly across `recipient`, `subject`, and `body` fields via debounced Elasticsearch API.
8. **Real Google & Slack OAuth**: Authenticate securely with Google OAuth and connect Slack channels to receive deduplicated hourly rate-limit alert notifications.
9. **BullMQ Monitoring Board**: Accessible at `/admin/queues` powered by `@bull-board/express`.

---

## 🚀 Quick Start Guide

### Prerequisites
- Node.js >= 18.x
- npm >= 9.x
- Docker & Docker Compose (optional, for running containerized infrastructure)

### 1. Infrastructure Setup (Docker Compose)
Start PostgreSQL, Redis, and Elasticsearch containers with health checks:
```bash
docker compose up -d
```

### 2. Environment Setup
Copy the example environment file:
```bash
cp .env.example .env
```

### 3. Install Workspace Dependencies
```bash
npm install
```

### 4. Build Shared Package & Database Migrations
```bash
npm run build:shared
npm run prisma:generate
npm run prisma:migrate
```

### 5. Run Development Servers
Start both Backend (Port 5000) and Frontend (Port 3000):
```bash
npm run dev
```

Visit:
- **Frontend Dashboard**: `http://localhost:3000`
- **Backend API**: `http://localhost:5000/api/health`
- **BullMQ Monitoring Board**: `http://localhost:5000/admin/queues`

---

## 🔑 Environment Variables Reference

| Variable | Description | Default |
|---|---|---|
| `NODE_ENV` | Environment mode | `development` |
| `PORT` | Backend HTTP server port | `5000` |
| `FRONTEND_URL` | Client origin URL for CORS | `http://localhost:3000` |
| `DATABASE_URL` | PostgreSQL connection URL | `postgresql://postgres:postgres@localhost:5432/reachinbox_db` |
| `REDIS_HOST` | Redis host | `localhost` |
| `REDIS_PORT` | Redis port | `6379` |
| `WORKER_CONCURRENCY` | BullMQ worker concurrency | `5` |
| `MIN_DELAY_BETWEEN_EMAILS_MS` | Minimum delay between emails per sender | `2000` |
| `MAX_EMAILS_PER_HOUR_PER_SENDER` | Maximum emails per sender per hour | `200` |
| `ELASTICSEARCH_URL` | Elasticsearch node URL | `http://localhost:9200` |
| `GOOGLE_CLIENT_ID` | Google OAuth Client ID | `your-google-client-id` |
| `GOOGLE_CLIENT_SECRET` | Google OAuth Client Secret | `your-google-client-secret` |
| `SLACK_CLIENT_ID` | Slack OAuth Client ID | `your-slack-client-id` |
| `SLACK_CLIENT_SECRET` | Slack OAuth Client Secret | `your-slack-client-secret` |

---

## 📊 5-Minute Evaluation Demo Script

1. **Login (0:00)**: Open `http://localhost:3000/login`. Click **Quick One-Click Demo Access** or **Sign in with Google OAuth**.
2. **Dashboard Overview (0:30)**: Observe metrics for Scheduled Queue, Active Workers, Sent, and Failures.
3. **Connect Slack (1:00)**: Click **Connect Slack** in the top right header to link Slack alerts.
4. **Compose Campaign & Upload CSV (1:30)**:
   - Click **Compose New Email**.
   - Drag & drop a sample `emails.csv` or type comma-separated emails.
   - Observe live syntax validation ("247 valid email recipients detected").
   - Set start time, 2000ms delay, and click **Schedule Emails**.
5. **Inspect BullMQ Board (2:20)**: Open `http://localhost:5000/admin/queues` in a browser tab to view active, delayed, and completed jobs.
6. **Server Restart Recovery Demo (3:30)**:
   - Schedule an email 2 minutes in the future.
   - Stop the backend process (`Ctrl+C`).
   - Restart the backend (`npm run dev:backend`).
   - Observe that BullMQ and PostgreSQL resume the exact scheduled job without duplicate sends or resetting time!
7. **Search & Ethereal Preview (4:30)**:
   - Use top Elasticsearch search bar to query recipient email addresses.
   - Switch to **Sent Emails** tab and click **Preview** to open the Nodemailer Ethereal message view.

---

## ⚡ 1000 Email Bulk Scheduling Scenario & Architecture

When 1000+ emails are scheduled simultaneously:
1. **Durable Ingestion**: The Express API parses recipients, inserts 1000 rows into PostgreSQL, and queues 1000 delayed BullMQ jobs in Redis within milliseconds.
2. **Controlled Concurrency**: BullMQ workers process jobs up to `WORKER_CONCURRENCY=5`.
3. **Rate Limit Safety**: After 200 emails are sent in the current hour window, the Redis atomic Lua script rejects the 201st request. The job is automatically deferred to `nextHourStart` and rescheduled safely in BullMQ.
4. **Slack Alert Deduplication**: A single Slack notification is dispatched per hourly window (`slack-rate-limit-notified:{senderId}:{hourWindow}`) so team channels are never spammed.

---

## 🧪 Running Automated Tests

Run the backend test suite:
```bash
npm run test
```

Verify strict TypeScript compilation across the monorepo:
```bash
npm run typecheck
```

---

## 🛠 Engineering Trade-offs & SMTP Exactly-Once Delivery Note

Email delivery via standard Internet SMTP cannot be mathematically guaranteed *exactly once* if a worker process crashes between accepting the SMTP socket confirmation and writing the final `sent` row status to PostgreSQL. To minimize duplicate risks:
- Atomic database updates (`scheduled` -> `processing`) ensure single-worker execution.
- BullMQ Redis jobs persist attempt counts and state.
- Ethereal SMTP message IDs and preview links are persisted to database records upon completion.
