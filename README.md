sophia-central-backend

Centralized academic resource and research platform backend.

## Authentication and onboarding

Sophia Central supports multiple sign-up and sign-in entry points for the onboarding flow:

- email sign-up and sign-in
- Google OAuth / Google sign-in
- Apple sign-in
- social handle sign-in for platforms such as X, LinkedIn, and Instagram
- onboarding completion after account creation

### Auth endpoints

- `POST /auth/signup` — create an account with email/password
- `POST /auth/login` — sign in with email/password
- `POST /auth/social` — social provider sign-in / account linking
- `POST /auth/google` — Google-specific sign-in route
- `POST /auth/apple` — Apple-specific sign-in route
- `POST /auth/onboarding` — complete profile onboarding after sign-up or social sign-in
- `GET /auth/me` — fetch the authenticated user profile

### Account flow

1. New users can sign up with email and password or continue with a social provider.
2. Social sign-in creates or links an account and returns a JWT.
3. The client completes onboarding to add institution, faculty, department, study level, bio, and social handle.
4. Once onboarding is complete, the account is marked profile complete and verified.

## Stack

- NestJS
- TypeScript
- PostgreSQL
- Redis
- MinIO
- OpenAI-compatible AI provider integration

## Getting started

1. `npm install`
2. `docker compose up -d postgres redis minio`
3. create `.env` based on `.env.example`
4. `npm run start:dev`

## API docs

Swagger is available at `/api/docs`.
