export type EmailStatus = 'scheduled' | 'processing' | 'sent' | 'failed' | 'cancelled';

export const EmailStatus = {
  SCHEDULED: 'scheduled' as EmailStatus,
  PROCESSING: 'processing' as EmailStatus,
  SENT: 'sent' as EmailStatus,
  FAILED: 'failed' as EmailStatus,
  CANCELLED: 'cancelled' as EmailStatus,
};

export interface UserDTO {
  id: string;
  googleId: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SenderDTO {
  id: string;
  userId: string;
  name: string;
  email: string;
  etherealUser: string;
  etherealPassword?: string;
  createdAt: string;
  updatedAt: string;
}

export interface EmailCampaignDTO {
  id: string;
  userId: string;
  senderId: string;
  subject: string;
  body: string;
  startTime: string;
  delayBetweenEmails: number;
  hourlyLimit: number;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduledEmailDTO {
  id: string;
  campaignId: string | null;
  userId: string;
  senderId: string;
  recipient: string;
  subject: string;
  body: string;
  scheduledAt: string;
  status: EmailStatus;
  bullJobId: string | null;
  attempts: number;
  lastError: string | null;
  sentAt: string | null;
  etherealMessageId: string | null;
  etherealPreviewUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SlackConnectionDTO {
  id: string;
  userId: string;
  teamId: string;
  teamName: string;
  channelId: string | null;
  isConnected: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduleEmailsRequest {
  subject: string;
  body: string;
  recipients: string[];
  startTime: string;
  delayBetweenEmails: number;
  hourlyLimit: number;
  senderId: string;
}

export interface ScheduleEmailsResponse {
  campaignId: string;
  totalRecipients: number;
  validRecipients: number;
  invalidRecipients: number;
  scheduledCount: number;
  scheduledEmails: ScheduledEmailDTO[];
}

export interface ParseCsvResult {
  totalRows: number;
  validEmails: string[];
  invalidEmails: string[];
  duplicateEmails: string[];
}

export const QUEUE_NAME = 'email-send';
