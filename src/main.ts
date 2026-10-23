import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { securitySetup } from './common/security';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  securitySetup(app as any);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // API documentation is opt-in. In production, expose it only deliberately
  // and protect it at the reverse proxy or with an authentication guard.
  if (process.env.SWAGGER_ENABLED === 'true') {
    const config = new DocumentBuilder()
      .setTitle('Sophia Central API')
      .setDescription('Academic resource and research platform backend')
      .setVersion('1.0')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  const logger = new Logger('Bootstrap');
  await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
  logger.log(`Sophia Central API is running on port ${process.env.PORT ?? 3000}`);
}

bootstrap();
