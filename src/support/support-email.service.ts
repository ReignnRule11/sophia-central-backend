import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupportRequest } from './entities/support-request.entity';
import { User } from '../users/entities/user.entity';

@Injectable()
export class SupportEmailService {
  private readonly logger = new Logger(SupportEmailService.name);

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(
      this.config.get<string>('RESEND_API_KEY') &&
      this.config.get<string>('SUPPORT_EMAIL') &&
      this.config.get<string>('SUPPORT_FROM_EMAIL'),
    );
  }

  getConfigurationStatus() {
    return {
      configured: this.isConfigured(),
      provider: 'resend',
      inboundReplySync: false,
    };
  }

  async notifyNewRequest(request: SupportRequest, user: User): Promise<boolean> {
    if (!this.isConfigured()) return false;
    const supportEmail = this.config.get<string>('SUPPORT_EMAIL')!;
    const appUrl = this.config.get<string>('FRONTEND_URL') || 'https://sophiscentral.vercel.app';
    const requestUrl = new URL('/moderation/support', appUrl).toString();
    const subject = `New Sophis Central support request: ${request.subject}`;
    const text = [
      'A new support request has been submitted.',
      `Ticket: ${request.id}`,
      `From: ${user.firstName || ''} ${user.lastName || ''} <${user.email}>`.trim(),
      `Category: ${request.category}`,
      `Subject: ${request.subject}`,
      '',
      request.description,
      '',
      `Open Support: ${requestUrl}`,
    ].join('\n');
    const html = `<h2>New Sophis Central support request</h2><p><strong>Ticket:</strong> ${this.escapeHtml(request.id)}</p><p><strong>From:</strong> ${this.escapeHtml([user.firstName, user.lastName].filter(Boolean).join(' ') || user.email)} (${this.escapeHtml(user.email)})</p><p><strong>Category:</strong> ${this.escapeHtml(request.category)}</p><p><strong>Subject:</strong> ${this.escapeHtml(request.subject)}</p><p>${this.escapeHtml(request.description).replace(/\n/g, '<br>')}</p><p><a href="${this.escapeHtml(requestUrl)}">Open this request in Sophis Central</a></p>`;
    await this.send(supportEmail, subject, text, html, user.email);
    await this.send(user.email, 'We received your Sophis Central support request', `Hello ${user.firstName || 'there'},\n\nWe have received your support request “${request.subject}”. Our support team will review it and reply to you.\n\nTicket: ${request.id}\n\nSophis Central Support`, `<p>Hello ${this.escapeHtml(user.firstName || 'there')},</p><p>We have received your support request <strong>${this.escapeHtml(request.subject)}</strong>. Our support team will review it and reply to you.</p><p><strong>Ticket:</strong> ${this.escapeHtml(request.id)}</p><p>Sophis Central Support</p>`, supportEmail);
    return true;
  }

  async sendResolution(request: SupportRequest, user: User): Promise<boolean> {
    if (!this.isConfigured()) return false;
    const supportEmail = this.config.get<string>('SUPPORT_EMAIL')!;
    const subject = `Update on your Sophis Central support request: ${request.subject}`;
    const resolution = request.resolutionMessage || 'Your support request has been reviewed.';
    const text = `Hello ${user.firstName || 'there'},\n\nOur support team has concluded your request “${request.subject}”.\n\nResolution:\n${resolution}\n\nTicket: ${request.id}\n\nSophis Central Support`;
    const html = `<p>Hello ${this.escapeHtml(user.firstName || 'there')},</p><p>Our support team has concluded your request <strong>${this.escapeHtml(request.subject)}</strong>.</p><p><strong>Resolution</strong></p><p>${this.escapeHtml(resolution).replace(/\n/g, '<br>')}</p><p><strong>Ticket:</strong> ${this.escapeHtml(request.id)}</p><p>Sophis Central Support</p>`;
    await this.send(user.email, subject, text, html, supportEmail);
    return true;
  }

  private async send(to: string, subject: string, text: string, html: string, replyTo?: string): Promise<void> {
    const apiKey = this.config.get<string>('RESEND_API_KEY');
    const from = this.config.get<string>('SUPPORT_FROM_EMAIL');
    if (!apiKey || !from) throw new Error('Support email delivery is not configured');
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, text, html, ...(replyTo ? { reply_to: replyTo } : {}) }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      this.logger.error(`Support email delivery failed with HTTP ${response.status}`);
      throw new Error(`Support email delivery failed with HTTP ${response.status}`);
    }
  }

  private escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[character] || character);
  }
}
