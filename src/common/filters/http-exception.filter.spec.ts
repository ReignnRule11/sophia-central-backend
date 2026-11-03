import { ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';
import { SentryService } from '../services/sentry.service';

describe('HttpExceptionFilter', () => {
  let sentryService: jest.Mocked<Pick<SentryService, 'captureException'>>;
  let filter: HttpExceptionFilter;
  let response: { status: jest.Mock; json: jest.Mock };

  const createHost = (): ArgumentsHost =>
    ({
      switchToHttp: () => ({
        getResponse: () => response,
      }),
    }) as unknown as ArgumentsHost;

  beforeEach(() => {
    sentryService = {
      captureException: jest.fn(),
    };
    filter = new HttpExceptionFilter(sentryService as unknown as SentryService);
    response = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
  });

  it('captures unexpected server errors and returns the standard response', () => {
    const error = new Error('database unavailable');

    filter.catch(error, createHost());

    expect(sentryService.captureException).toHaveBeenCalledWith(error);
    expect(response.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: { message: 'Internal server error' },
      }),
    );
  });

  it('does not send expected 4xx client errors to Sentry', () => {
    const error = new HttpException('Forbidden', HttpStatus.FORBIDDEN);

    filter.catch(error, createHost());

    expect(sentryService.captureException).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(HttpStatus.FORBIDDEN);
  });
});
