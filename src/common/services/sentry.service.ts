import { Injectable } from '@nestjs/common';
import * as Sentry from '@sentry/node';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SentryService {
  private readonly enabled: boolean;

  constructor(private readonly config: ConfigService) {
    const sentryDsn = this.config.get<string>('SENTRY_DSN');

    this.enabled = Boolean(sentryDsn);

    if (sentryDsn) {
      Sentry.init({
        dsn: sentryDsn,
        environment:
          this.config.get<string>('NODE_ENV') || 'development',
        tracesSampleRate:
          this.config.get<string>('NODE_ENV') === 'production' ? 0.1 : 1.0,
      });
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  captureException(error: Error) {
    return Sentry.captureException(error);
  }

  captureMessage(
    message: string,
    level: 'fatal' | 'error' | 'warning' | 'info' | 'debug' = 'info',
  ) {
    return Sentry.captureMessage(message, level);
  }

  async flush(timeoutMs = 5000): Promise<boolean> {
    if (!this.enabled) {
      return false;
    }

    return Sentry.flush(timeoutMs);
  }
}