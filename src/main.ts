import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { securitySetup } from './common/security';
import { CsrfGuard } from './common/guards/csrf.guard';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { rateLimit } from 'express-rate-limit';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { SentryService } from './common/services/sentry.service';

const authRateLimit = (max: number) =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max,
    standardHeaders: true,
    legacyHeaders: false,
  });

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Configure Express proxy trust and application security before
  // registering any rate-limiting middleware.
  securitySetup(app);

  // Apply focused limits to authentication endpoints while keeping the
  // CSRF bootstrap endpoint usable during normal page loads and retries.
  app.use('/auth/csrf', authRateLimit(120));
  app.use('/auth/login', authRateLimit(30));
  app.use('/auth/signup', authRateLimit(5));
  app.use('/auth/email-verification/resend', authRateLimit(5));
  app.use('/auth/email-verification/confirm', authRateLimit(20));
  app.use('/auth/onboarding/complete', authRateLimit(10));
  app.use('/auth/password-reset/request', authRateLimit(5));
  app.use('/auth/password-reset/confirm', authRateLimit(10));
  app.use('/auth/account-deletion/cancel', authRateLimit(5));
  app.use('/users/me/deletion-request', authRateLimit(5));
  app.use('/users/me/deactivate', authRateLimit(5));
  app.use('/users/me/security-question', authRateLimit(10));

  app.useGlobalGuards(new CsrfGuard());

  // Resolve the configured service from Nest's container and register the
  // exception filter globally so uncaught HTTP 5xx errors reach Sentry.
  app.useGlobalFilters(new HttpExceptionFilter(app.get(SentryService)));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  if (process.env.SWAGGER_ENABLED === 'true') {
    const config = new DocumentBuilder()
      .setTitle('Sophis Central API')
      .setDescription('Academic resource and research platform backend')
      .setVersion('1.0')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  const logger = new Logger('Bootstrap');
  await app.listen(process.env.PORT ?? 3000, '0.0.0.0');

  logger.log(`Sophis Central API is running on port ${process.env.PORT ?? 3000}`);
}

bootstrap();
