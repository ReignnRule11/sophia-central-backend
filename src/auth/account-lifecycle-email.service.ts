import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AccountLifecycleEmailService {
  private readonly logger = new Logger(AccountLifecycleEmailService.name);

  constructor(private readonly config: ConfigService) {}

  async sendOtp(email: string, firstName: string | undefined, code: string, purpose: 'reactivation' | 'deletion-cancellation'): Promise<void> {
    const apiKey = this.config.get<string>('RESEND_API_KEY');
    const from = this.config.get<string>('RESEND_FROM_EMAIL') || this.config.get<string>('PASSWORD_RESET_FROM_EMAIL');
    if (!apiKey || !from) {
      this.logger.error('Account lifecycle email is not configured; check RESEND_API_KEY and RESEND_FROM_EMAIL.');
      throw new InternalServerErrorException('Account verification email is not configured.');
    }

    const action = purpose === 'reactivation' ? 'reactivate your Sophis Central account' : 'cancel your account deletion request';
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [email],
        subject: purpose === 'reactivation' ? 'Your Sophis Central reactivation code' : 'Your Sophis Central deletion-cancellation code',
        text: `Hello ${firstName?.trim() || 'there'},\n\nUse this one-time code to ${action}: ${code}\n\nThis code expires in 10 minutes. If you did not request this, you can ignore this email.\n\nSophis Central`,
        html: `<p>Hello ${this.escape(firstName?.trim() || 'there')},</p><p>Use this one-time code to ${action}:</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">${code}</p><p>This code expires in 10 minutes. If you did not request this, you can ignore this email.</p><p>Sophis Central</p>`,
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      const details = await response.text();
      this.logger.error(`Account lifecycle email delivery failed with HTTP ${response.status}: ${details}`);
      throw new InternalServerErrorException('Account verification email could not be sent.');
    }
  }

  private escape(value: string): string {
    const entities: Record<string, string> = {
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    };
    return value.replace(/[&<>"']/g, character => entities[character] || character);
  }
}
