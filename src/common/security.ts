import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';

export const securitySetup = (app: NestExpressApplication) => {
  const isProduction = process.env.NODE_ENV === 'production';
  const configuredOrigins = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (isProduction && configuredOrigins.length === 0) {
    throw new Error('CORS_ORIGINS must contain the exact trusted frontend origins in production');
  }

  app.use(helmet());
  app.enableCors({
    origin: (origin, callback) => {
      // Requests without Origin are non-browser clients such as health checks.
      if (!origin) {
        return callback(null, true);
      }
      const allowedOrigins = isProduction
        ? configuredOrigins
        : configuredOrigins.length > 0
          ? configuredOrigins
          : ['http://localhost:3000', 'http://localhost:5173'];
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error('Origin not allowed by CORS'));
    },
    credentials: true,
  });

  // Keep a broad safety ceiling for unexpected traffic without allowing
  // ordinary app activity (polling, notifications, chat, etc.) to exhaust
  // the same small quota used by authentication requests.
  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 5000,
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );
};
