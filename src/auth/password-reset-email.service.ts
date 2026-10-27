import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class PasswordResetEmailService {
  private readonly logger = new Logger(PasswordResetEmailService.name);

  constructor(private readonly config: ConfigService) {}

  async sendResetLink(
    email: string,
    token: string,
    firstName?: string,
  ): Promise<void> {
    const apiKey = this.config.get<string>('RESEND_API_KEY');
    const from = this.config.get<string>('PASSWORD_RESET_FROM_EMAIL');
    const appUrl = this.config.get<string>('FRONTEND_URL');
    const templateId = this.config.get<string>('RESEND_TEMPLATE_ID');

    if (!apiKey || !from || !appUrl || !templateId) {
      this.logger.error(
        'Password reset email is not configured; check RESEND_API_KEY, PASSWORD_RESET_FROM_EMAIL, FRONTEND_URL, and RESEND_TEMPLATE_ID.',
      );
      throw new InternalServerErrorException(
        'Password recovery email is not configured',
      );
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
        template: {
          id: templateId,
          variables: {
            USER_FIRST_NAME: firstName?.trim() || 'there',
            RESET_URL: resetUrl.toString(),
            EXPIRY_MINUTES: 30,
          },
        },
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      const details = await response.text();
      this.logger.error(
        `Resend password-reset email failed with HTTP ${response.status}: ${details}`,
      );
      throw new InternalServerErrorException(
        'Password recovery email could not be sent',
      );
    }
  }
}
