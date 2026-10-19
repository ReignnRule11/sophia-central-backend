# Sophia Central — Backend

This repository contains the backend for Sophia Central — a centralized, curated academic resource and research platform for students.

This README is focused on the feature branch `feature/phase3-ai-multi-llm` and documents the current project structure, implemented features, local dev instructions, and next steps. Keep this file up-to-date as the backend evolves.

---

## Project overview

Sophia Central backend provides:

- User authentication, roles and profiles (students, lecturers, moderators, admins)
- Institution, faculty, department, course, and topic taxonomy
- Resource library (notes, slides, past questions, research papers) with metadata
- Secure file uploads using presigned S3/MinIO URLs and file metadata tracking
- Moderation workflow with scan + moderator approval
- Wisdom Points economy and point transaction ledger
- Search endpoints (Postgres full-text for MVP) and resource discovery
- AI study assistant endpoints (chat & summarize) with multi-LLM provider support and usage logging
- Background worker (ai-scanner) for ClamAV scanning of uploaded files
- Local dev convenience: MinIO + MinIO Console + ClamAV docker-compose override

---

## Implemented features (phase & status)

Phase 1 (foundation)
- [x] NestJS + TypeScript application skeleton
- [x] PostgreSQL configuration and migrations structure
- [x] JWT-based auth and user roles (starter)
- [x] Resource CRUD and search API endpoints (starter)

Phase 2 (domain)
- [x] Institutions, Faculties, Departments modules and CRUD
- [x] Courses, Topics modules and CRUD
- [x] Moderation workflow skeleton (statuses, moderation queue endpoints)
- [x] Wisdom Points entities and endpoints

Phase 3 (uploads & AI — current branch)
- [x] S3 presigned upload flow (S3Service)
- [x] Upload controller: creates a pending resource_files DB record on presign
- [x] resource_files table + entity + repository
- [x] Scanner worker (ai-scanner) that polls DB and scans files via ClamAV
  - [x] HTTP scan wrapper support (CLAMAV_HTTP_SCAN_URL)
  - [x] TCP clamd integration support via clamdjs (when installed)
  - [x] Local-dev auto-pass fallback (for iteration)
- [x] Multi-LLM provider abstraction (OpenAI, Anthropic, Azure, self-hosted Llama)
- [x] Provider priority/fallback routing (AI_PROVIDER_PRIORITY)
- [x] ai_usage_logs persistence and AiRepository logging
- [x] Docker-compose override with MinIO, MinIO Console, ClamAV, ai-scanner
- [x] .env.example documenting required environment variables

Planned / Next (follow-up work)
- [ ] Cost estimation per AI provider & per-user quotas
- [ ] Vector DB integration for context retrieval (Qdrant / pgvector)
- [ ] Production-ready ClamAV worker tuning and alerting
- [ ] Tests and CI for scanner + MinIO integration
- [ ] Admin UIs for moderation and points management

---

## Project tree (well-structured)

Top-level (important files & folders)

```
/ (repo root)
├── apps/
│   ├── api/                             # NestJS API application
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── app.module.ts
│   │   │   └── modules/
│   │   │       ├── auth/                # auth module (register/login/roles)
│   │   │       ├── users/               # user endpoints and profiles
│   │   │       ├── institutions/        # institutions, faculties, departments
│   │   │       ├── courses/             # courses and topics
│   │   │       ├── resources/           # resource CRUD and search
│   │   │       ├── upload/              # upload controller (presign + persist file)
│   │   │       └── ai/                  # AiController, AiService skeleton
│   │   └── PHASE3_README.md             # API / module notes
│   └── ai-scanner/                      # small worker image for ClamAV scanning
│       ├── Dockerfile
│       └── package.json
├── libs/
│   ├── storage/                         # storage helpers and file entity/repo
│   │   ├── src/
│   │   │   ├── s3.service.ts            # S3 presign service
│   │   │   ├── resource-file.entity.ts  # TypeORM entity for resource_files
│   │   │   ├── resource-files.repository.ts
│   │   │   └── scanner/                 # scanner worker implementation
│   │   │       └── worker.ts
│   │   └── ...
│   └── common/                          # shared utilities (logger, config, DTOs)
├── migrations/                          # SQL migrations
│   └── 003_add_files_and_ai_usage.sql
├── docker-compose.override.yml          # local dev override (MinIO, ClamAV, ai-scanner)
├── .env.example                         # environment variables template
├── PHASE3_MULTI_LLM_README.md           # phase-specific instructions
└── tests/                               # unit tests
```

This tree focuses on the files and folders relevant to Phase 3. The codebase follows a modular NestJS layout so each domain module can be extended independently.

---

## Upload & verification flow (end-to-end)

1. Client requests presigned upload URL:
   - POST /v1/resources/:id/upload-request
   - Server validates filename, generates S3 presigned PUT URL, and persists a resource_files record:
     { resource_id, s3_key, filename, content_type, uploaded_by, verified=false, scan_passed=false }
   - Response includes uploadUrl, s3 key, and fileId

2. Client uploads file directly to S3/MinIO using the presigned PUT URL.

3. Scanner worker (ai-scanner) polls resource_files where scan_passed=false and:
   - Downloads object from S3/MinIO
   - If CLAMAV_HTTP_SCAN_URL is set → POST the file to the HTTP scanner wrapper
   - Else if CLAMAV_DAEMON_ADDR is set and clamd client available → perform TCP clamd scan
   - If ClamAV not configured → worker currently auto-passes for local dev (WARNING: change for prod)
   - Worker sets scan_passed = true/false and stores scan metadata

4. A moderator reviews the file in admin UI or via moderation endpoint and sets verified=true to publish.
   - Final publish requires both scan_passed === true AND moderator approval.

---

## AI service & provider wiring

- Providers implemented (adapters):
  - OpenAI (uses OPENAI_API_KEY, OPENAI_MODEL)
  - Anthropic (ANTHROPIC_API_KEY, ANTHROPIC_MODEL)
  - Azure OpenAI (AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_KEY, AZURE_OPENAI_DEPLOYMENT)
  - Llama HTTP adapter (LLM_HOST, LLM_API_KEY)

- Routing strategy: priority-based fallback controlled by `AI_PROVIDER_PRIORITY` (comma-separated list). Default order: openai,anthropic,azure,llama.

- AiService responsibilities:
  - Route chat/summarize requests to providers in configured order
  - Log usage to `ai_usage_logs` (user_id, provider, model, tokens, prompt, result summary)
  - Return results and provider metadata to API callers

- Cost estimation & quotas: TODO (planned follow-up)

---

## Environment variables

Add these to your .env (see .env.example). Important ones include:

- DATABASE_URL, REDIS_URL
- JWT_SECRET
- S3_ENDPOINT, S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY
- MINIO_ROOT_USER, MINIO_ROOT_PASSWORD
- CLAMAV_DAEMON_ADDR or CLAMAV_HTTP_SCAN_URL
- OPENAI_API_KEY, OPENAI_MODEL
- ANTHROPIC_API_KEY, ANTHROPIC_MODEL
- AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_KEY, AZURE_OPENAI_DEPLOYMENT
- LLM_HOST, LLM_API_KEY
- AI_PROVIDER_PRIORITY (e.g. openai,anthropic,azure,llama)

---

## Migrations

Run:

```bash
psql $DATABASE_URL -f migrations/003_add_files_and_ai_usage.sql
```

(or run your TypeORM migration flow if configured)

---

## Running locally (quick)

1. cp .env.example .env and edit values
2. Ensure Postgres + Redis are running (via docker-compose or local services)
3. Create MinIO bucket using MinIO Console or `mc` (name = S3_BUCKET)
4. docker compose -f docker-compose.override.yml up -d
5. Build repo so dist files exist (the ai-scanner Dockerfile assumes built JS at `dist/libs/storage/scanner`) or adjust Dockerfile
6. Run migrations
7. npm install && npm run start:dev

---

## Tests

- Unit tests are in `tests/` (e.g., provider selection test included).
- Add more unit/integration tests for scanner and ai endpoints in future PRs.

---

## Next recommended steps

- Pin and add clamd client dependency to the main build or ensure ai-scanner installs it at container build time.
- Harden scanner worker (robust TCP clamd client, retry/backoff, alerting on failed scans)
- Implement AI cost estimation and enforce per-user quotas
- Add vector DB for retrieval in AI assistant (pgvector/Qdrant)
- Implement admin UI and basic analytics for moderation/points

---

If you want this README mirrored to `develop`/`main` branches I can open a PR that updates README.md in the default branch as well. Otherwise this README is committed to the feature branch `feature/phase3-ai-multi-llm` and ready for the PR.
