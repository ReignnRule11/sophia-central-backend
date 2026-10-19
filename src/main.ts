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

  const config = new DocumentBuilder()
    .setTitle('Sophia Central API')
    .setDescription('Academic resource and research platform backend')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const logger = new Logger('Bootstrap');
  await app.listen(process.env.PORT ?? 3000);
  logger.log(`Sophia Central API is running on: http://localhost:${process.env.PORT ?? 3000}`);
}

bootstrap();
