import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { securitySetup } from './common/security';
import { CsrfGuard } from './common/guards/csrf.guard';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { rateLimit } from 'express-rate-limit';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  securitySetup(app as any);
  app.use('/auth/password-reset/request', rateLimit({ windowMs: 15 * 60 * 1000, max: 5, standardHeaders: true, legacyHeaders: false }));
  app.use('/auth/password-reset/confirm', rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false }));
  app.useGlobalGuards(new CsrfGuard());

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
