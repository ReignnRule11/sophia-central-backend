import { Injectable } from '@nestjs/common';
import * as Sentry from '@sentry/node';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SentryService {
  constructor(private readonly config: ConfigService) {
    const sentryDsn = this.config.get<string>('SENTRY_DSN');

    if (sentryDsn) {
      Sentry.init({
        dsn: sentryDsn,
        environment: this.config.get<string>('NODE_ENV') || 'development',
        tracesSampleRate: this.config.get<string>('NODE_ENV') === 'production' ? 0.1 : 1.0,
      });
    }
  }

  captureException(error: Error) {
    Sentry.captureException(error);
  }

  captureMessage(message: string, level: 'fatal' | 'error' | 'warning' | 'info' | 'debug' = 'info') {
    Sentry.captureMessage(message, level);
  }
}
