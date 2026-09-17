import nodemailer from 'nodemailer';
import { logger } from '../../utils/logger';

export interface SendMailParams {
  from: string;
  to: string;
  subject: string;
  body: string;
  etherealUser?: string;
  etherealPassword?: string;
}

export interface SendMailResult {
  messageId: string;
  previewUrl: string | null;
}

export class EtherealEmailService {
  /**
   * Generates a new test account on Ethereal Email.
   */
  public static async createEtherealAccount(): Promise<{ user: string; pass: string }> {
    try {
      const testAccount = await nodemailer.createTestAccount();
      logger.info({ user: testAccount.user }, 'Generated new Ethereal Email SMTP test account');
      return {
        user: testAccount.user,
        pass: testAccount.pass,
      };
    } catch (err: any) {
      logger.error({ error: err.message }, 'Failed to create Ethereal account, returning fallback credentials');
      return {
        user: 'mock_ethereal_user@ethereal.email',
        pass: 'mock_ethereal_password',
      };
    }
  }

  /**
   * Sends an email via Nodemailer Ethereal SMTP.
   */
  public static async sendMail(params: SendMailParams): Promise<SendMailResult> {
    let etherealUser = params.etherealUser;
    let etherealPass = params.etherealPassword;

    if (!etherealUser || !etherealPass) {
      const acc = await this.createEtherealAccount();
      etherealUser = acc.user;
      etherealPass = acc.pass;
    }

    const transporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: {
        user: etherealUser,
        pass: etherealPass,
      },
      tls: {
        rejectUnauthorized: false,
      },
    });

    const info = await transporter.sendMail({
      from: `"${params.from}" <${etherealUser}>`,
      to: params.to,
      subject: params.subject,
      text: params.body,
      html: `<div style="font-family: sans-serif; padding: 20px; color: #333;">
               <h2>${params.subject}</h2>
               <div style="margin-top: 15px; font-size: 15px; line-height: 1.6;">${params.body.replace(/\n/g, '<br/>')}</div>
               <hr style="margin-top: 30px; border: none; border-top: 1px solid #eee;" />
               <p style="font-size: 12px; color: #888;">Sent via ReachInbox Email Scheduler</p>
             </div>`,
    });

    const previewUrl = nodemailer.getTestMessageUrl(info) || null;

    logger.info(
      { messageId: info.messageId, to: params.to, previewUrl },
      'Email sent successfully via Ethereal SMTP'
    );

    return {
      messageId: info.messageId,
      previewUrl,
    };
  }
}
