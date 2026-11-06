import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class EmailVerificationEmailService {
  private readonly logger = new Logger(EmailVerificationEmailService.name);

  constructor(private readonly config: ConfigService) {}

  async sendVerificationLink(email: string, token: string, firstName?: string): Promise<void> {
    const apiKey = this.config.get<string>('RESEND_API_KEY');
    const from = this.config.get<string>('RESEND_FROM_EMAIL')
      || this.config.get<string>('PASSWORD_RESET_FROM_EMAIL');
    const appUrl = this.config.get<string>('FRONTEND_URL');
    const templateId = this.config.get<string>('RESEND_EMAIL_VERIFICATION_TEMPLATE_ID');

    if (!apiKey || !from || !appUrl || !templateId) {
      this.logger.error('Email verification is not configured; check RESEND_API_KEY, RESEND_FROM_EMAIL, FRONTEND_URL, and RESEND_EMAIL_VERIFICATION_TEMPLATE_ID.');
      throw new InternalServerErrorException('Email verification is not configured');
    }

    const verificationUrl = new URL('/verify-email', appUrl);
    verificationUrl.searchParams.set('token', token);

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [email],
        template: {
          id: templateId,
          variables: {
            USER_FIRST_NAME: firstName?.trim() || 'there',
            VERIFY_URL: verificationUrl.toString(),
            EXPIRY_HOURS: '24',
          },
        },
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      const details = await response.text();
      this.logger.error(`Resend email-verification delivery failed with HTTP ${response.status}: ${details}`);
      throw new InternalServerErrorException('Verification email could not be sent');
    }
  }
}
