import { EmailStatus } from '@reachinbox/shared';
import { EtherealEmailService } from '../integrations/email/ethereal';
import { logger } from './logger';

export interface UserRecord {
  id: string;
  googleId: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SenderRecord {
  id: string;
  userId: string;
  name: string;
  email: string;
  etherealUser: string;
  etherealPassword?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CampaignRecord {
  id: string;
  userId: string;
  senderId: string;
  subject: string;
  body: string;
  startTime: Date;
  delayBetweenEmails: number;
  hourlyLimit: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ScheduledEmailRecord {
  id: string;
  campaignId: string | null;
  userId: string;
  senderId: string;
  recipient: string;
  subject: string;
  body: string;
  scheduledAt: Date;
  status: EmailStatus;
  bullJobId: string | null;
  attempts: number;
  lastError: string | null;
  sentAt: Date | null;
  etherealMessageId: string | null;
  etherealPreviewUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
  sender?: SenderRecord;
}

export interface SlackConnectionRecord {
  id: string;
  userId: string;
  teamId: string;
  teamName: string;
  accessToken: string;
  channelId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

class InMemoryStore {
  public users: Map<string, UserRecord> = new Map();
  public senders: Map<string, SenderRecord> = new Map();
  public campaigns: Map<string, CampaignRecord> = new Map();
  public scheduledEmails: Map<string, ScheduledEmailRecord> = new Map();
  public slackConnections: Map<string, SlackConnectionRecord> = new Map();

  constructor() {
    this.seedDefaultUserAndSender();
  }

  private seedDefaultUserAndSender() {
    const demoUser: UserRecord = {
      id: 'demo-user-id-123',
      googleId: 'demo-google-id-123',
      name: 'ReachInbox Demo User',
      email: 'demo@reachinbox.ai',
      avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.users.set(demoUser.id, demoUser);

    const defaultSender: SenderRecord = {
      id: 'demo-sender-id-123',
      userId: demoUser.id,
      name: 'ReachInbox Outreach Lead',
      email: 'sales@reachinbox.ai',
      etherealUser: 'mock_ethereal_user@ethereal.email',
      etherealPassword: 'mock_password',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.senders.set(defaultSender.id, defaultSender);
  }

  // --- Users ---
  public findUserById(id: string): UserRecord | null {
    return this.users.get(id) || null;
  }

  public findUserByEmail(email: string): UserRecord | null {
    for (const u of this.users.values()) {
      if (u.email === email) return u;
    }
    return null;
  }

  public findUserByGoogleIdOrEmail(googleId: string, email: string): UserRecord | null {
    for (const u of this.users.values()) {
      if (u.googleId === googleId || u.email === email) return u;
    }
    return null;
  }

  public createUser(data: Omit<UserRecord, 'id' | 'createdAt' | 'updatedAt'>): UserRecord {
    const id = `user-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const user: UserRecord = {
      ...data,
      id,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.users.set(id, user);
    return user;
  }

  // --- Senders ---
  public getSendersForUser(userId: string): SenderRecord[] {
    const list: SenderRecord[] = [];
    for (const s of this.senders.values()) {
      if (s.userId === userId) list.push(s);
    }
    return list;
  }

  public createSender(data: Omit<SenderRecord, 'id' | 'createdAt' | 'updatedAt'>): SenderRecord {
    const id = `sender-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const sender: SenderRecord = {
      ...data,
      id,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.senders.set(id, sender);
    return sender;
  }

  public deleteSender(id: string, userId: string): void {
    const existing = this.senders.get(id);
    if (existing && existing.userId === userId) {
      this.senders.delete(id);
    }
  }

  // --- Campaigns ---
  public createCampaign(data: Omit<CampaignRecord, 'id' | 'createdAt' | 'updatedAt'>): CampaignRecord {
    const id = `campaign-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const campaign: CampaignRecord = {
      ...data,
      id,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.campaigns.set(id, campaign);
    return campaign;
  }

  public getCampaignsForUser(userId: string): CampaignRecord[] {
    const list: CampaignRecord[] = [];
    for (const c of this.campaigns.values()) {
      if (c.userId === userId) list.push(c);
    }
    return list;
  }

  // --- Scheduled Emails ---
  public createScheduledEmail(data: Omit<ScheduledEmailRecord, 'id' | 'createdAt' | 'updatedAt'>): ScheduledEmailRecord {
    const id = `email-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const email: ScheduledEmailRecord = {
      ...data,
      id,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.scheduledEmails.set(id, email);
    return email;
  }

  public getEmailsForUser(userId: string, statuses: EmailStatus[]): ScheduledEmailRecord[] {
    const list: ScheduledEmailRecord[] = [];
    for (const e of this.scheduledEmails.values()) {
      if (e.userId === userId && statuses.includes(e.status)) {
        const sender = this.senders.get(e.senderId);
        list.push({ ...e, sender });
      }
    }
    return list;
  }

  public updateScheduledEmail(id: string, patch: Partial<ScheduledEmailRecord>): ScheduledEmailRecord | null {
    const existing = this.scheduledEmails.get(id);
    if (!existing) return null;
    const updated = {
      ...existing,
      ...patch,
      updatedAt: new Date(),
    };
    this.scheduledEmails.set(id, updated);
    return updated;
  }

  public searchEmails(userId: string, query: string, status?: string): ScheduledEmailRecord[] {
    const q = query.toLowerCase().trim();
    const list: ScheduledEmailRecord[] = [];
    for (const e of this.scheduledEmails.values()) {
      if (e.userId !== userId) continue;
      if (status && e.status !== status) continue;

      if (
        !q ||
        e.recipient.toLowerCase().includes(q) ||
        e.subject.toLowerCase().includes(q) ||
        e.body.toLowerCase().includes(q)
      ) {
        const sender = this.senders.get(e.senderId);
        list.push({ ...e, sender });
      }
    }
    return list;
  }

  // --- Slack Connections ---
  public getSlackConnection(userId: string): SlackConnectionRecord | null {
    for (const s of this.slackConnections.values()) {
      if (s.userId === userId) return s;
    }
    return null;
  }

  public saveSlackConnection(data: Omit<SlackConnectionRecord, 'id' | 'createdAt' | 'updatedAt'>): SlackConnectionRecord {
    const existing = this.getSlackConnection(data.userId);
    const id = existing ? existing.id : `slack-${Date.now()}`;
    const record: SlackConnectionRecord = {
      ...data,
      id,
      createdAt: existing ? existing.createdAt : new Date(),
      updatedAt: new Date(),
    };
    this.slackConnections.set(id, record);
    return record;
  }

  public deleteSlackConnection(userId: string): void {
    const existing = this.getSlackConnection(userId);
    if (existing) {
      this.slackConnections.delete(existing.id);
    }
  }
}

export const inMemoryStore = new InMemoryStore();
