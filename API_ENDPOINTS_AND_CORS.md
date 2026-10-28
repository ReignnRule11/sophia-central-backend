# Sophis Central - API Endpoints & CORS Configuration

Complete reference guide for all API endpoints, CORS setup, and integration requirements for frontend (web) and mobile (iOS/Android) applications.

---

## Table of Contents

1. [CORS Configuration](#cors-configuration)
2. [Authentication Endpoints](#authentication-endpoints)
3. [User Management Endpoints](#user-management-endpoints)
4. [Institution & Academic Structure](#institution--academic-structure)
5. [Courses & Topics](#courses--topics)
6. [Resources Management](#resources-management)
7. [Search & Discovery](#search--discovery)
8. [Moderation & Review](#moderation--review)
9. [Storage & File Upload](#storage--file-upload)
10. [Wisdom Points System](#wisdom-points-system)
11. [Referral Program](#referral-program)
12. [AI Study Assistant](#ai-study-assistant)
13. [Analytics & Admin](#analytics--admin)
14. [Development & Seeding](#development--seeding)
15. [Response Formats](#response-formats)
16. [Error Handling](#error-handling)

---

## CORS Configuration

### Backend CORS Setup (NestJS)

```typescript
// main.ts - Application Bootstrap
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: process.env.CORS_ORIGINS?.split(',') || [
      'http://localhost:3000',
      'http://localhost:3001',
      'https://sophia-central.com',
      'https://app.sophia-central.com',
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'X-Client-Version',
      'X-Device-ID',
      'Accept-Language',
    ],
    exposedHeaders: [
      'X-Total-Count',
      'X-Page-Number',
      'X-Page-Size',
      'X-RateLimit-Limit',
      'X-RateLimit-Remaining',
      'X-RateLimit-Reset',
    ],
    maxAge: 86400,
    optionsSuccessStatus: 200,
    preflightContinue: false,
  });

  await app.listen(3000);
}

bootstrap();
```

### Environment Variables (.env)

```env
CORS_ORIGINS=http://localhost:3000,http://localhost:3001,https://sophia-central.com,https://app.sophia-central.com,capacitor://localhost,ionic://localhost
API_URL=http://localhost:3000
API_TIMEOUT=30000
API_RATE_LIMIT=100
ALLOWED_CLIENT_VERSIONS=1.0.0,1.0.1,1.1.0
MIN_REQUIRED_CLIENT_VERSION=1.0.0
```

### Frontend Integration (React/Vue/Angular)

```typescript
const API_CLIENT = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:3000',
  timeout: 30000,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
    'Accept-Language': navigator.language,
    'X-Client-Version': APP_VERSION,
    'X-Device-ID': getDeviceId(),
  },
});

API_CLIENT.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
```

### Mobile Integration (React Native/Flutter)

```javascript
export const API_CONFIG = {
  baseURL: Platform.select({
    ios: 'https://api.sophia-central.com',
    android: 'https://api.sophia-central.com',
  }),
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    'X-Client-Version': '1.0.0',
    'X-Device-ID': getDeviceUniqueId(),
    'X-Platform': Platform.OS,
  },
};
```

---

## Authentication Endpoints

### Register New User

```http
POST /auth/register
```

Body:
```json
{
  "firstName": "Ayomide",
  "lastName": "Student",
  "email": "ayomide@example.com",
  "password": "SecurePassword123"
}
```

### Login

```http
POST /auth/login
```

Body:
```json
{
  "email": "ayomide@example.com",
  "password": "SecurePassword123"
}
```

### Get Current User

```http
GET /auth/me
Authorization: Bearer <token>
```

### Refresh Token

```http
POST /auth/refresh
```

### Logout

```http
POST /auth/logout
Authorization: Bearer <token>
```

---

## User Management Endpoints

```http
GET /users
GET /users/me
PATCH /users/:id
DELETE /users/:id
```

---

## Institution & Academic Structure

```http
POST /institutions
GET /institutions
GET /institutions/:id
PATCH /institutions/:id
DELETE /institutions/:id
```

```http
POST /courses
GET /courses
GET /courses/:id
PATCH /courses/:id
DELETE /courses/:id
```

---

## Resources Management

```http
POST /resources
GET /resources
GET /resources/:id
PATCH /resources/:id
DELETE /resources/:id
POST /resources/:resourceId/rate
POST /resources/:resourceId/download
```

---

## Search & Discovery

```http
GET /search?q=programming&course=uuid&level=100&type=lecture_notes&institution=uuid
GET /search/trending
GET /search/recommended
```

---

## Moderation & Review

```http
GET /moderation/queue
PATCH /moderation/resources/:id/review
POST /moderation/resources/:id/flag
```

---

## Storage & File Upload

```http
POST /storage/presigned-url
POST /storage/confirm-upload
```

---

## Wisdom Points System

```http
GET /points/:userId/balance
GET /points/:userId/transactions
POST /points/award
```

---

## Referral Program

```http
POST /referrals/create
GET /referrals/my-code
GET /referrals/:code
POST /referrals/redeem
GET /referrals/stats/overview
```

---

## AI Study Assistant

```http
POST /ai/ask
GET /ai/history
```

---

## Analytics & Admin

```http
GET /analytics/overview
GET /analytics/resources
GET /analytics/users
GET /analytics/trending
```

---

## Development & Seeding

```http
POST /seed/run
POST /seed/clear
```

---

## Recommended CORS Policy for Frontend + Mobile

For production, use a strict allowlist instead of `*`.

```typescript
app.enableCors({
  origin: [
    'https://sophia-central.com',
    'https://app.sophia-central.com',
    'https://admin.sophia-central.com',
    'capacitor://localhost',
    'ionic://localhost',
    'http://localhost:3000',
    'http://localhost:3001',
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Authorization', 'Content-Type', 'X-Client-Version', 'X-Device-ID'],
});
```

### Frontend notes
- Web apps use browser CORS normally.
- Keep credentials enabled if using cookies or secure session flows.
- Do not allow wildcard origins in production.

### Mobile notes
- Mobile apps usually call the API directly via native HTTP clients.
- For hybrid apps (Capacitor/Ionic), include the app origin in the allowlist.
- Use `Authorization: Bearer <token>` for JWT auth.

---

## Authentication Headers

```http
Authorization: Bearer <jwt_token>
```

---

## Common Response Format

```json
{
  "data": {},
  "message": "Operation successful",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

Error format:

```json
{
  "statusCode": 400,
  "message": "Validation error",
  "errors": [
    {
      "field": "email",
      "message": "Email must be a valid email address"
    }
  ]
}
```

---

## Production Checklist

- [ ] Use explicit CORS origins; never `*`
- [ ] Enable HTTPS in production
- [ ] Validate JWT expiration and refresh flows
- [ ] Restrict upload file types and sizes
- [ ] Add rate limiting
- [ ] Log CORS/preflight failures
- [ ] Keep frontend and mobile client versions in sync

---

This document is intended as a practical reference for integrating the Sophis Central backend with frontend and mobile clients.
