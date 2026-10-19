# Sophia Central — Backend

Status: Feature branch `feature/phase3-ai-multi-llm` — Phase 3 work in progress

Quick summary
- Backend for Sophia Central: a curated academic resource platform.
- This branch delivers Phase 3: multi-LLM AI assistant wiring, secure upload flow with scan + moderation, and local development conveniences (MinIO + ClamAV + scanner worker).

Table of contents
- Project overview
- Implemented features (by phase)
- Project tree (focused view)
- End-to-end upload & verification flow
- AI provider wiring / behavior
- Scanner worker (ClamAV) details
- Environment variables
- Migrations
- Local development (step-by-step)
- Testing & CI notes
- Security & operational notes
- PR checklist & review guidance

---

## Project overview
Sophia Central provides a single, trusted place for students to find lecture notes, past questions, research papers and related academic resources. The backend is a modular NestJS service with a focus on secure uploads, quality moderation, discoverability, and an AI-powered study assistant.

---

## Implemented features (phase & status)

Phase 1 — Foundation
- NestJS + TypeScript app skeleton
- PostgreSQL-ready configuration and starter migrations
- JWT auth scaffolding and role stubs
- Resource CRUD and search (starter)

Phase 2 — Domain
- Institutions, Faculties, Departments modules and CRUD
- Courses & Topics model and endpoints
- Moderation workflow (statuses and queue)
- Wisdom Points ledger & basic endpoints

Phase 3 — Uploads & AI (this branch)
- S3/MinIO presigned upload flow (S3Service)
- UploadController persists pending `resource_files` record on presign
- `resource_files` entity & repository
- Scanner worker (ai-scanner): ClamAV integration via HTTP wrapper or TCP clamd (clamdjs)
- Multi-LLM provider adapters (OpenAI, Anthropic, Azure OpenAI, self-hosted Llama)
- Provider priority/fallback routing (`AI_PROVIDER_PRIORITY`)
- `ai_usage_logs` persistence for usage/cost tracking
- docker-compose.override.yml for MinIO, MinIO Console, ClamAV, ai-scanner
- .env.example and README guidance

Planned (follow-ups)
- Cost-estimation & per-user AI quotas
- Vector DB (pgvector/Qdrant) for retrieval-augmented responses
- Harden scanner (backoff, alerting, quarantines)
- Admin UI for moderation & points management

---

## Project tree (focused)
```
/ (repo root)
├── apps/
│   ├── api/                     # NestJS API
│   │   └── src/modules/         # domain modules (auth, users, resources, upload, ai...)
│   └── ai-scanner/              # scanner worker image (Dockerfile + package.json)
├── libs/
│   └── storage/                 # S3 service, resource_files entity, scanner implementation
├── migrations/                  # SQL migrations (resource_files, ai_usage_logs)
├── docker-compose.override.yml  # MinIO + ClamAV + ai-scanner for local dev
├── .env.example                 # env vars template
└── README.md                    # this file
```

---

## Upload & verification flow (end-to-end)
1. Client requests presigned URL:
   - POST /v1/resources/:id/upload-request
   - Server validates filename, creates presigned PUT URL, and persists a `resource_files` row:
     { resource_id, s3_key, filename, content_type, uploaded_by, verified=false, scan_passed=false }
   - Response: { uploadUrl, key, fileId }

2. Client uploads file directly to S3/MinIO using the presigned PUT URL.

3. Scanner worker polls DB rows with `scan_passed=false`:
   - Downloads object from S3/MinIO
   - If `CLAMAV_HTTP_SCAN_URL` present → POST file for scan
   - Else if `CLAMAV_DAEMON_ADDR` present and `clamdjs` available → perform TCP clamd scan
   - Else (local-dev) worker auto-passes (WARNING: change for production)
   - Worker updates `resource_files.scan_passed` and stores scan metadata

4. Moderator reviews and sets `resource_files.verified = true` to publish. Final publish requires both `scan_passed === true` AND moderator approval.

---

## AI service & provider wiring
- Implemented provider adapters:
  - OpenAI (OPENAI_API_KEY, OPENAI_MODEL)
  - Anthropic (ANTHROPIC_API_KEY, ANTHROPIC_MODEL)
  - Azure OpenAI (AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_KEY, AZURE_OPENAI_DEPLOYMENT)
  - Llama HTTP adapter (LLM_HOST, LLM_API_KEY)

- Routing: priority-based fallback controlled by `AI_PROVIDER_PRIORITY` (comma separated). Default order: `openai,anthropic,azure,llama`.
- AiService logs usage to `ai_usage_logs` via `AiRepository` (provider, model, tokens, prompt, result summary, metadata).
- Cost estimation and quotas are TODO — will be implemented in follow-up.

---

## Scanner worker (ClamAV) details
- Two scanning options supported:
  1. HTTP scan wrapper: send file buffer to `CLAMAV_HTTP_SCAN_URL` and expect JSON { clean: true/false }
  2. TCP clamd integration (preferred for production): connect to clamd via `CLAMAV_DAEMON_ADDR` (host:port) using `clamdjs` or similar library
- Local-dev fallback: if neither configured, the worker marks files as passed (for developer iteration). Change this before production.
- The worker logs scan metadata and will WARN/flag infected files (integration to moderation/quarantine is a follow-up).

---

## Environment variables (major ones — see .env.example)
- DATABASE_URL, REDIS_URL, JWT_SECRET
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
Apply DB migrations before running:

```bash
psql "$DATABASE_URL" -f migrations/003_add_files_and_ai_usage.sql
```

(or use your existing migration pipeline)

---

## Local development (step-by-step)
1. Copy environment template and edit: `cp .env.example .env`
2. Start core services (Postgres, Redis, etc.) — using your existing docker-compose for the repo:
   - `docker compose up -d`
3. Start local dev services from this branch:
   - `docker compose -f docker-compose.override.yml up -d` (starts MinIO, MinIO Console, ClamAV, ai-scanner)
4. Create MinIO bucket named by `S3_BUCKET` (use MinIO Console or `mc`)
5. Build the repo so the scanner `dist` artifacts exist (or modify ai-scanner Dockerfile to run TypeScript build inside container)
6. Run DB migrations
7. Start API: `npm install && npm run start:dev`
8. Test upload → scan → moderator flow and AI endpoints

Notes
- The ai-scanner Dockerfile expects compiled JS at `dist/libs/storage/scanner`. If your CI / build does not produce that path, either build before starting ai-scanner or change Dockerfile.

---

## Testing & CI notes
- Unit tests: `tests/` includes a provider-order test. Add tests for scanner flow and ai endpoints.
- CI should:
  - Build repository (produce `dist`),
  - Run linter and unit tests,
  - Optionally start the MinIO + ClamAV services in the test matrix for scanner integration tests.

---

## Security & operational notes
- Never commit API keys or S3 credentials. Use environment variables / secrets in CI.
- Presigned URLs are short-lived; S3 objects should be private.
- Scanner must be enabled in production; remove the local-dev auto-pass behavior.
- Log AI usage for auditing and cost control (already logged to `ai_usage_logs`).
- Moderation is required before resources are published.

---

## PR checklist & review guidance
Before merging this branch into `develop` ensure:
- [ ] All migrations have been applied and reviewed
- [ ] `.env.example` contains required vars and no secrets
- [ ] Scanner worker has a tested ClamAV integration (clamdjs installed or HTTP wrapper verified)
- [ ] ai-scanner build path is compatible with CI pipeline (dist exists or Dockerfile builds TS)
- [ ] Provider keys available in CI/dev env for integration testing
- [ ] Unit tests pass and basic E2E smoke test for upload → scan → verify performed

How to review
- Read the PHASE3 README for module-level notes
- Focus review on: AiService provider routing + error handling, UploadController DB write and presign consistency, scanner worker scan result handling and DB updates, docker-compose override correctness

---

If you want any additional subsections (example API request/response snippets, seed data, or troubleshooting steps), tell me where to add them and I will update this README before opening the PR.
