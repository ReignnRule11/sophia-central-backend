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

The active NestJS application configures CORS in `src/common/security.ts`. It reads a comma-separated `CORS_ORIGINS` environment variable, trims each entry, and compares the browser's Origin against the exact allowlist. Credentialed requests are enabled; wildcard origins are not supported. In production the API refuses to start if `CORS_ORIGINS` is empty.

### Production web frontend

The canonical production frontend origin is:

```text
https://sophiscentral.vercel.app
```

Set the following on the existing Render backend service:

```env
CORS_ORIGINS=https://sophiscentral.vercel.app
FRONTEND_URL=https://sophiscentral.vercel.app
```

During the domain cutover, retain the currently configured previous frontend origin in `CORS_ORIGINS` alongside the new origin until the old hostname redirects correctly and the new domain passes login, authenticated API, and password-reset checks. Then remove the previous origin. Do not use `*` because the API allows credentials.

### Local development

Keep local Vite origins in local environment configuration, not in the production allowlist unless there is a deliberate operational reason:

```env
CORS_ORIGINS=http://localhost:5173
FRONTEND_URL=http://localhost:5173
API_URL=http://localhost:4000
```

The current frontend defaults to `http://localhost:4000` for its local API and to `https://sophia-central-backend.onrender.com` in production unless `VITE_API_BASE_URL` is explicitly supplied. Changing the frontend hostname does not change that API base URL.

### Active CORS implementation

The following is a simplified illustration of the production allowlist behavior. The source of truth is `src/common/security.ts`:

```typescript
const allowedOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.enableCors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Origin not allowed by CORS'));
  },
  credentials: true,
});
```

### Mobile applications

Native mobile HTTP clients generally do not enforce browser CORS. For hybrid apps such as Capacitor/Ionic, add their actual runtime origins (for example `capacitor://localhost` or `ionic://localhost`) only if those clients need browser-style CORS access. Keep the production web origin and any required mobile origins as explicit entries.

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

## CORS operational notes

- The deployed backend's `CORS_ORIGINS` value is authoritative; documentation examples do not override Render environment variables.
- Add each trusted origin as an exact scheme-and-host pair, with no trailing path.
- Keep credentials enabled only with explicit trusted origins; never use a wildcard.
- After changing Render environment variables, allow the backend to redeploy before testing from the browser.
- Keep local Vite origins in local development configuration, not in the production allowlist by default.

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
