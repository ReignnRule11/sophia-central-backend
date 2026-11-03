import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { SentryService } from '../services/sentry.service';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(private readonly sentryService: SentryService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    // Report server-side failures only; expected client errors (4xx) are not
    // actionable application exceptions and should not create Sentry noise.
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      const error =
        exception instanceof Error ? exception : new Error(String(exception));
      this.sentryService.captureException(error);
    }

    const message =
      exception instanceof HttpException
        ? exception.getResponse()
        : { message: 'Internal server error' };

    response.status(status).json({
      success: false,
      statusCode: status,
      message,
      timestamp: new Date().toISOString(),
    });
  }
}
