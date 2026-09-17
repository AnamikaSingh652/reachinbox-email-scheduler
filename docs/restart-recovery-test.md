# Server & Worker Restart Recovery Verification Test

This test verifies that scheduled delayed email jobs survive backend server crashes or restarts without losing jobs or sending duplicates.

## Execution Sequence

### 1. Launch Infrastructure & Backend Services
```bash
docker compose up -d
npm run dev
```

### 2. Schedule Email 60 Seconds in Future
In Dashboard Compose modal or via API:
```bash
curl -X POST http://localhost:5000/api/emails/schedule \
  -H "Content-Type: application/json" \
  -d '{
    "subject": "Restart Recovery Test",
    "body": "Testing persistence across worker restarts",
    "senderId": "<SENDER_ID>",
    "recipients": ["restart-test@example.com"],
    "startTime": "'$(date -u -d "+60 seconds" +"%Y-%m-%dT%H:%M:%SZ")'",
    "delayBetweenEmails": 2000,
    "hourlyLimit": 200
  }'
```

### 3. Stop Backend & Worker Process Immediately
Press `Ctrl+C` in terminal running `npm run dev` or terminate node process.

### 4. Wait 15 Seconds & Restart Backend Services
```bash
npm run dev
```

### 5. Expected Verification Results
1. On startup, `QueueRecoveryService` scans PostgreSQL and verifies BullMQ state.
2. BullMQ restores delayed job from Redis.
3. When schedule time arrives, worker executes job and sends email via Nodemailer Ethereal.
4. PostgreSQL status transitions `scheduled` -> `processing` -> `sent`.
5. Exactly **1** email record is created (0 duplicate records).
