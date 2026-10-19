# Sophia Central Backend

A production-ready MVP backend for the Sophia Central academic resource platform.

## Features

- Students, lecturers, moderators, and admins
- Academic institutions, faculties, departments, and courses
- Verified resource uploads and moderation workflow
- Search and discovery by institution, course, level, and topic
- Wisdom Points wallet and reward system
- AI tutor and summary features with usage quotas
- File uploads via S3-compatible storage
- Notifications, referrals, and analytics foundation

## Stack

- NestJS
- TypeScript
- PostgreSQL
- Redis
- MinIO (local object storage)
- OpenAI-compatible LLM integration
- Swagger API docs

## Getting started

1. Install dependencies:
   ```bash
   npm install
   ```
2. Start infrastructure:
   ```bash
   docker compose up -d postgres redis minio
   ```
3. Create a `.env` file based on `.env.example`.
4. Start the app:
   ```bash
   npm run start:dev
   ```
5. Visit API docs:
   - http://localhost:3000/api/docs
   - Health check: http://localhost:3000/health

## Environment

See `.env.example` for the configuration.

## Production notes

This backend is structured for a real educational platform: secure uploads, AI assistance, content moderation, reward mechanics, and institutional organization.
