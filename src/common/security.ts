import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { rateLimit } from 'express-rate-limit';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';

export const securitySetup = (app: NestExpressApplication) => {
  app.use(helmet());
  app.enableCors({
    origin: true,
    credentials: true,
  });
  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 300,
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );
};
