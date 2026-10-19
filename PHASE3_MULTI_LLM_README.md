# Phase 3 enhancements: Multi-LLM providers, scanner worker, docker-compose override

What I changed / added
- AI providers: OpenAI, Anthropic, Azure OpenAI, Llama HTTP adapter
  - apps/api/src/modules/ai/providers/*
- AiModule, AiService and AiRepository wiring
  - apps/api/src/modules/ai/ai.module.ts
  - apps/api/src/modules/ai/ai.service.ts
  - apps/api/src/modules/ai/ai.repository.ts
- ResourceFiles entity and repository (libs/storage)
  - libs/storage/src/resource-file.entity.ts
  - libs/storage/src/resource-files.repository.ts
- Scanner worker (polling stub, tries ClamAV if configured)
  - libs/storage/src/scanner/worker.ts
- docker-compose.override.yml for local dev with MinIO, MinIO console, ClamAV daemon, and ai-scanner worker
- .env.example with environment variables required for local dev

How it works (quick)
1) AI requests: AiService routes chat/summarize requests to providers in order defined by AI_PROVIDER_PRIORITY or default order (openai -> anthropic -> azure -> llama). Usage is logged to ai_usage_logs via AiRepository.

2) Upload flow: when a client requests a presigned URL the existing upload controller should create a resource_files row (pending). The scanner worker will poll for unscanned files, download them from S3/MinIO, and attempt a ClamAV scan. On clean scan, mark scan_passed=true. A moderator must still explicitly mark resource_files.verified=true to publish.

3) Local dev: run docker compose up to start db, redis, minio, clamav, and the scanner worker (see .env.example for required vars). The scanner currently uses a stubbed HTTP clamd path if CLAMAV_HTTP_SCAN_URL is provided; otherwise it assumes pass for local dev unless CLAMAV_DAEMON_ADDR is set and a clamd TCP integration is implemented.

Next steps I recommend
- Wire UploadController to create a resource_files DB record when issuing presigned URLs (I can add this in a follow-up commit).
- Implement clamd TCP integration in the scanner worker (using a library such as node-clamd or a clamd RPC client) for robust scanning.
- Add AI provider cost estimation (tokens -> cost) per provider and quota enforcement in AiService.
- Add integration tests and CI to run scanner in a containerized test environment.

To run locally
1) copy .env.example to .env and fill in any provider keys you have (or leave blank for local dev)
2) docker compose up -d (ensure existing stack includes db/redis services)
3) run migrations
4) npm run start:dev

