# Sophia Central Backend

A production-ready MVP backend for the Sophia Central academic resource platform.

## Features

- Student, lecturer, moderator, and admin authentication
- Institution, faculty, department, and course models
- Resource upload and management for notes, past questions, papers, and projects
- Search, filtering, and discovery by institution, course, level, and topic
- Referral and Wisdom Points foundation
- Content moderation workflow
- JWT-based auth and role guards
- PostgreSQL + Redis-ready architecture
- Dockerized local environment

## Tech stack

- NestJS
- TypeScript
- PostgreSQL
- Redis
- TypeORM
- JWT / Passport
- Swagger

## Quick start

1. Copy `.env.example` to `.env` and update credentials.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the local environment:
   ```bash
   docker compose up -d postgres redis
   ```
4. Run the app:
   ```bash
   npm run start:dev
   ```
5. Open docs:
   - http://localhost:3000/api/docs
   - Health: http://localhost:3000/health

## Environment variables

See `.env.example` for the required values.

## Production notes

This starter backend is structured to support future growth into AI-assisted academic guidance, premium access, moderation workflows, and institutional partnerships.
