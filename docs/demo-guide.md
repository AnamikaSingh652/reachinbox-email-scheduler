# 5-Minute Evaluation Demo Script

Follow this step-by-step sequence for evaluating ReachInbox Email Scheduler:

## Step 1: Authentication & Onboarding (0:00 - 0:30)
1. Navigate to `http://localhost:3000/login`.
2. Click **Sign in with Google OAuth** or **Quick One-Click Demo Access**.
3. Verify redirection to `/dashboard` with header showing user avatar, name, and status.

## Step 2: Slack Integration (0:30 - 1:15)
1. Click **Connect Slack** in top header navigation.
2. Observe connected state indicator (`Connected (ReachInbox Sales Team)`).

## Step 3: Outreach Campaign Composition & CSV Parsing (1:15 - 2:30)
1. Click **Compose New Email** button.
2. Select desired Sender (or use auto-generated Ethereal sender).
3. Enter Subject: `Scaling Sales Pipeline` and Body: `Hi {{name}}, reaching out regarding your recent growth...`.
4. Upload CSV file or paste 5+ recipient emails.
5. Observe live validation counter (`5 valid email recipients detected`).
6. Set Start Time = 30 seconds from now, Send Delay = `2000ms`, Hourly Limit = `3`.
7. Click **Schedule Emails**.

## Step 4: BullMQ Queue Inspection (2:30 - 3:30)
1. Open Bull Board at `http://localhost:5000/admin/queues` in new browser tab.
2. Observe delayed jobs waiting for schedule execution.
3. Watch status transition from `delayed` -> `active` -> `completed`.

## Step 5: Rate Limiting & Deferred Rescheduling (3:30 - 4:15)
1. Observe that after 3 emails (hourly limit), the 4th email status is deferred/delayed to next hour window.
2. Check Slack notification dispatch log (`SLACK_RATE_LIMIT_NOTIFICATION_SENT`).

## Step 6: Ethereal SMTP & Elasticsearch Search (4:15 - 5:00)
1. Click **Sent Emails** tab on Dashboard.
2. Click **Preview** on any sent row to open Nodemailer Ethereal web view.
3. Type recipient email into Elasticsearch top search bar and verify debounced search results.
