# 🎥 ReachInbox Email Scheduler — Assignment Demo Video Guide

Use this script and guide to record a 2–3 minute video demo using [Loom](https://www.loom.com), [Loom Screen Recorder](https://chrome.google.com/webstore/detail/loom), or [OBS Studio] for your assignment submission.

---

## ⏱️ Video Demo Timestamp Breakdown (2–3 Minutes)

### 1. Introduction (0:00 - 0:25)
* **Screen**: Open [http://localhost:3000](http://localhost:3000)
* **Script**: *"Hi! In this video demonstration, I am presenting the full-stack ReachInbox Email Scheduler built with Node.js, Express, TypeScript, BullMQ, Redis, PostgreSQL, Nodemailer (Ethereal SMTP), and React."*

### 2. Login & Sender Management (0:25 - 0:50)
* **Action**: Click **"Login with Google"** or **"Demo Login"**.
* **Action**: Click **"Add Sender"** button on the dashboard.
* **Input**: Name `Outreach Lead`, Email `outreach@reachinbox.ai`.
* **Script**: *"Here in the dashboard, we can dynamically add senders. Each sender automatically links to an Ethereal SMTP account for real email dispatching."*

### 3. CSV Lead Import & Scheduling (0:50 - 1:30)
* **Action**: Click **"Compose Email"** / **"Schedule Campaign"**.
* **Input**:
  * Subject: `ReachInbox Automated Outreach Campaign`
  * Body: `Hello {{name}}! Welcome to ReachInbox Email Scheduler.`
  * Upload sample CSV / enter recipients.
  * Set delay: `2000 ms` (2 seconds).
* **Action**: Click **"Schedule Email Campaign"**.
* **Script**: *"When scheduling, the API validates the recipients, creates database campaign records, and enqueues BullMQ delayed jobs."*

### 4. Viewing Scheduled & Sent Emails (1:30 - 2:00)
* **Action**: Click **"Scheduled Emails"** tab to view pending jobs.
* **Action**: Wait 5 seconds for jobs to process.
* **Action**: Click **"Sent Emails"** tab to view sent emails with **Ethereal Preview Link** and **Message ID**.
* **Script**: *"Once the delay expires, the worker claims the job atomically, applies rate limiting and minimum delay rules, sends the email via Nodemailer, stores the Ethereal preview link, and indexes the record into Elasticsearch."*

### 5. BullMQ Queue Monitor Dashboard (2:00 - 2:30)
* **Screen**: Open [http://localhost:5000/admin/queues](http://localhost:5000/admin/queues)
* **Script**: *"Finally, here is the live BullMQ queue dashboard at `/admin/queues`, showing waiting, active, completed, and failed job counts."*

---

## 🔗 Recommended Video Hosting Services
1. **Loom (Recommended)**: [https://www.loom.com](https://www.loom.com) (Generates instant shareable link: `https://www.loom.com/share/your-video-id`)
2. **Google Drive**: Upload `.mp4` video and set access to *"Anyone with the link can view"*.
3. **YouTube**: Upload as *"Unlisted"* video.
