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
    const subject = `New Sophis Central support request [${request.ticketNumber}]: ${request.subject}`;
    const text = [
      'A new support request has been submitted.',
      `Ticket: ${request.ticketNumber}`,
      `From: ${user.firstName || ''} ${user.lastName || ''} <${user.email}>`.trim(),
      `Category: ${request.category}`,
      `Subject: ${request.subject}`,
      '',
      request.description,
      '',
      `Open Support: ${requestUrl}`,
    ].join('\n');
    const html = `<h2>New Sophis Central support request</h2><p><strong>Ticket:</strong> ${this.escapeHtml(request.ticketNumber)}</p><p><strong>From:</strong> ${this.escapeHtml([user.firstName, user.lastName].filter(Boolean).join(' ') || user.email)} (${this.escapeHtml(user.email)})</p><p><strong>Category:</strong> ${this.escapeHtml(request.category)}</p><p><strong>Subject:</strong> ${this.escapeHtml(request.subject)}</p><p>${this.escapeHtml(request.description).replace(/\n/g, '<br>')}</p><p><a href="${this.escapeHtml(requestUrl)}">Open this request in Sophis Central</a></p>`;
    await this.send(supportEmail, subject, text, html, user.email);
    await this.send(user.email, 'We received your Sophis Central support request', `Hello ${user.firstName || 'there'},\n\nWe have received your support request “${request.subject}”. Our support team will review it and reply to you.\n\nTicket: ${request.ticketNumber}\n\nSophis Central Support`, `<p>Hello ${this.escapeHtml(user.firstName || 'there')},</p><p>We have received your support request <strong>${this.escapeHtml(request.subject)}</strong>. Our support team will review it and reply to you.</p><p><strong>Ticket:</strong> ${this.escapeHtml(request.ticketNumber)}</p><p>Sophis Central Support</p>`, supportEmail);
    return true;
  }

  async sendResolution(request: SupportRequest, user: User): Promise<boolean> {
    if (!this.isConfigured()) return false;
    const supportEmail = this.config.get<string>('SUPPORT_EMAIL')!;
    const appUrl = this.config.get<string>('FRONTEND_URL') || 'https://sophiscentral.vercel.app';
    const activityUrl = new URL('/my-activity', appUrl).toString();
    const subject = `Sophis Central Support replied to ticket [${request.ticketNumber}]`;
    const text = [
      `Hello ${user.firstName || 'there'},`,
      '',
      `Our Support team has replied to your request “${request.subject}”.`,
      '',
      `Ticket: ${request.ticketNumber}`,
      '',
      'Your full response is available securely in My Activity. Sign in to Sophis Central to read the details and continue tracking your request.',
      `Open My Activity: ${activityUrl}`,
      '',
      'Sophis Central Support',
    ].join('\n');
    const html = `<p>Hello ${this.escapeHtml(user.firstName || 'there')},</p><p>Our Support team has replied to your request <strong>${this.escapeHtml(request.subject)}</strong>.</p><p><strong>Ticket:</strong> ${this.escapeHtml(request.ticketNumber)}</p><p>Your full response is available securely in <strong>My Activity</strong>. Sign in to Sophis Central to read the details and continue tracking your request.</p><p><a href="${this.escapeHtml(activityUrl)}">Sign in and view My Activity</a></p><p>Sophis Central Support</p>`;
    await this.send(user.email, subject, text, html, supportEmail);
    return true;
  }

  async sendGuestVerification(request: SupportRequest, token: string): Promise<void> {
    if (!this.isConfigured()) throw new Error('Support email delivery is not configured');
    const appUrl = this.config.get<string>('FRONTEND_URL') || 'https://sophiscentral.vercel.app';
    const verificationUrl = new URL('/contact', appUrl);
    verificationUrl.searchParams.set('verifySupport', token);
    const ticket = request.ticketNumber;
    const subject = `Verify your email for Sophis Central support ticket ${ticket}`;
    const text = `Hello ${request.senderName || 'there'},\n\nPlease verify this email address to submit your Sophis Central support request. This link expires in 30 minutes.\n\nVerify email: ${verificationUrl.toString()}\n\nTicket reference (after verification): ${ticket}\n\nIf you did not make this request, you can ignore this email.\n\nSophis Central Support`;
    const html = `<p>Hello ${this.escapeHtml(request.senderName || 'there')},</p><p>Please verify this email address to submit your Sophis Central support request. This link expires in 30 minutes.</p><p><a href="${this.escapeHtml(verificationUrl.toString())}">Verify email address</a></p><p>If you did not make this request, you can ignore this email.</p><p>Sophis Central Support</p>`;
    await this.send(request.senderEmail!, subject, text, html);
  }

  async notifyNewGuestRequest(request: SupportRequest): Promise<boolean> {
    if (!this.isConfigured()) return false;
    const supportEmail = this.config.get<string>('SUPPORT_EMAIL')!;
    const appUrl = this.config.get<string>('FRONTEND_URL') || 'https://sophiscentral.vercel.app';
    const requestUrl = new URL('/support/requests', appUrl).toString();
    const ticket = request.ticketNumber;
    const sender = request.senderName || request.senderEmail || 'Visitor';
    const subject = `New Sophis Central support ticket [${ticket}]: ${request.subject}`;
    const details = [
      'A new email-verified public support request has been submitted.',
      `Ticket: ${ticket}`,
      `From: ${sender} <${request.senderEmail}>`,
      `Institution: ${request.senderInstitution || 'Not provided'}`,
      `Faculty: ${request.senderFaculty || 'Not provided'}`,
      `Department: ${request.senderDepartment || 'Not provided'}`,
      `Category: ${request.category}`,
      `Subject: ${request.subject}`,
      '',
      request.description,
      '',
      ...(request.links ?? []).map(link => `Link: ${link}`),
      '',
      `Open Support: ${requestUrl}`,
    ].join('\n');
    const html = `<h2>New email-verified Sophis Central support request</h2><p><strong>Ticket:</strong> ${this.escapeHtml(ticket)}</p><p><strong>From:</strong> ${this.escapeHtml(sender)} (${this.escapeHtml(request.senderEmail || '')})</p><p><strong>Institution:</strong> ${this.escapeHtml(request.senderInstitution || 'Not provided')}</p><p><strong>Faculty:</strong> ${this.escapeHtml(request.senderFaculty || 'Not provided')}</p><p><strong>Department:</strong> ${this.escapeHtml(request.senderDepartment || 'Not provided')}</p><p><strong>Category:</strong> ${this.escapeHtml(request.category)}</p><p><strong>Subject:</strong> ${this.escapeHtml(request.subject)}</p><p>${this.escapeHtml(request.description).replace(/\n/g, '<br>')}</p><p><a href="${this.escapeHtml(requestUrl)}">Open this request in Sophis Central Support</a></p>`;
    await this.send(supportEmail, subject, details, html, request.senderEmail || undefined);
    const confirmationSubject = `Sophis Central support ticket received [${ticket}]`;
    const confirmationText = `Hello ${sender},\n\nWe have received your verified support request.\n\nTicket: ${ticket}\nSubject: ${request.subject}\n\nOur Support team will review your request. Keep this ticket reference for future correspondence.\n\nSophis Central Support`;
    const confirmationHtml = `<p>Hello ${this.escapeHtml(sender)},</p><p>We have received your verified support request.</p><p><strong>Ticket:</strong> ${this.escapeHtml(ticket)}</p><p><strong>Subject:</strong> ${this.escapeHtml(request.subject)}</p><p>Our Support team will review your request. Keep this ticket reference for future correspondence.</p><p>Sophis Central Support</p>`;
    await this.send(request.senderEmail!, confirmationSubject, confirmationText, confirmationHtml, supportEmail);
    return true;
  }

  async sendGuestResolution(request: SupportRequest): Promise<boolean> {
    if (!this.isConfigured() || !request.senderEmail) return false;
    const supportEmail = this.config.get<string>('SUPPORT_EMAIL')!;
    const appUrl = this.config.get<string>('FRONTEND_URL') || 'https://sophiscentral.vercel.app';
    const registrationUrl = new URL('/', appUrl).toString();
    const ticket = request.ticketNumber;
    const resolution = request.resolutionMessage || 'Your support request has been reviewed.';
    const subject = `Sophis Central Support response for ticket [${ticket}]: ${request.subject}`;
    const text = [
      `Hello ${request.senderName || 'there'},`,
      '',
      'Our Support team has responded to your request.',
      `Ticket: ${ticket}`,
      `Subject: ${request.subject}`,
      '',
      'Support response:',
      resolution,
      '',
      'Make more of Sophis Central',
      'If you do not already have an account, you are invited to register for Sophis Central to access the platform’s student and lecturer features, keep your academic activity together, and use the services available to your account.',
      `Explore Sophis Central and register: ${registrationUrl}`,
      '',
      'Sophis Central Support',
    ].join('\n');
    const html = `<p>Hello ${this.escapeHtml(request.senderName || 'there')},</p><p>Our Support team has responded to your request.</p><p><strong>Ticket:</strong> ${this.escapeHtml(ticket)}</p><p><strong>Subject:</strong> ${this.escapeHtml(request.subject)}</p><p><strong>Support response</strong></p><p>${this.escapeHtml(resolution).replace(/\n/g, '<br>')}</p><hr><h3>Make more of Sophis Central</h3><p>If you do not already have an account, you are invited to register for Sophis Central to access the platform’s student and lecturer features, keep your academic activity together, and use the services available to your account.</p><p><a href="${this.escapeHtml(registrationUrl)}">Explore Sophis Central and register</a></p><p>Sophis Central Support</p>`;
    await this.send(request.senderEmail, subject, text, html, supportEmail);
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
