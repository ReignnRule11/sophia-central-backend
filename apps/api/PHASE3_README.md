# Phase 3: Uploads & AI skeleton

This patch adds:
- S3Service (libs/storage) to generate presigned upload URLs
- UploadController: endpoint to request an upload URL for a resource
- AI module skeleton (AiService + AiController) with chat and summarize endpoints
- SQL migration to add resource_files and ai_usage_logs tables

Next steps I recommend:
- Wire these modules into the NestJS application (module files + providers)
- Implement DB repositories for resource_files and ai_usage_logs
- Add ClamAV virus-scan worker that scans S3 uploads via events
- Add MinIO + ClamAV services to docker-compose for local dev
- Implement an LLM provider integration with usage tracking and quotas
