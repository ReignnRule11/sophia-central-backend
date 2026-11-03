import {
  Controller,
  Get,
  Headers,
  NotFoundException,
  UnauthorizedException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';
import { SentryService } from '../services/sentry.service';

@Controller('diagnostics')
export class SentryDiagnosticController {
  constructor(
    private readonly sentryService: SentryService,
    private readonly config: ConfigService,
  ) {}

  @Get('sentry')
  async testSentry(
    @Headers('x-sentry-diagnostic-token') token?: string,
  ) {
    const expectedToken = this.config.get<string>(
      'SENTRY_DIAGNOSTIC_TOKEN',
    );

    if (!expectedToken) {
      throw new NotFoundException();
    }

    if (!token) {
      throw new UnauthorizedException();
    }

    const supplied = Buffer.from(token);
    const expected = Buffer.from(expectedToken);

    if (
      supplied.length !== expected.length ||
      !timingSafeEqual(supplied, expected)
    ) {
      throw new UnauthorizedException();
    }

    if (!this.sentryService.isEnabled()) {
      throw new ServiceUnavailableException(
        'Sentry is not initialized',
      );
    }

    const eventId = this.sentryService.captureMessage(
      `SOPHIS_CENTRAL_PRODUCTION_SENTRY_DIAGNOSTIC_${new Date().toISOString()}`,
      'error',
    );

    const flushed = await this.sentryService.flush(10000);

    if (!flushed) {
      throw new ServiceUnavailableException(
        'Sentry event delivery could not be confirmed',
      );
    }

    return {
      success: true,
      message: 'Sentry diagnostic event submitted successfully',
      eventId,
      environment: this.config.get<string>('NODE_ENV'),
      flushed,
    };
  }
}