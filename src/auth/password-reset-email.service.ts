import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class PasswordResetEmailService {
  private readonly logger = new Logger(PasswordResetEmailService.name);

  constructor(private readonly config: ConfigService) {}

  async sendResetLink(email: string, token: string): Promise<void> {
    const apiKey = this.config.get<string>('RESEND_API_KEY');
    const from = this.config.get<string>('PASSWORD_RESET_FROM_EMAIL');
    const appUrl = this.config.get<string>('FRONTEND_URL');

    if (!apiKey || !from || !appUrl) {
      this.logger.error('Password reset email is not configured; set RESEND_API_KEY, PASSWORD_RESET_FROM_EMAIL, and FRONTEND_URL.');
      throw new InternalServerErrorException('Password recovery email is not configured');
    }

    const resetUrl = new URL('/reset-password', appUrl);
    resetUrl.searchParams.set('token', token);
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [email],
        subject: 'Reset your Sophia Central password',
        text: `We received a request to reset your Sophia Central password. Use this link within 30 minutes: ${resetUrl.toString()}\n\nIf you did not request this, you can ignore this email.`,
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      this.logger.error(`Password reset email provider returned HTTP ${response.status}`);
      throw new InternalServerErrorException('Password recovery email could not be sent');
    }
  }
}
