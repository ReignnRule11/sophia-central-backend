# Sophia Central Backend — Production Deployment

This guide documents the supported **single-host Docker Compose deployment** in `docker-compose.prod.yml`. It is not a substitute for an ECS/Kubernetes deployment specification. The default `docker-compose.yml` is development-only and must not be used in production.

## 1. Requirements

- Docker Engine and the Docker Compose v2 plugin.
- A trusted HTTPS reverse proxy (for example, Caddy or Nginx) in front of the API.
- A DNS name and TLS certificate for the API.
- A secure place to store and back up database credentials and JWT signing secrets.
- A verified backup/restore process before applying schema changes.

The production Compose file binds the API to `127.0.0.1:3000`; PostgreSQL has no published host port. Terminate TLS at the reverse proxy and proxy to the loopback API port. Do not expose port 3000 directly to the internet.

## 2. Create the deployment environment file

Create `.env.production` on the deployment host. Do not commit it to Git or paste its contents into logs or support requests.

Generate secrets:

```bash
openssl rand -base64 48   # use as JWT_SECRET
openssl rand -base64 32   # use as DB_PASSWORD
```

Create the file with the following values, replacing every example/placeholder:

```dotenv
PORT=3000
DB_USERNAME=sophia_prod
DB_PASSWORD=REPLACE_WITH_GENERATED_DATABASE_PASSWORD
DB_DATABASE=sophia_central_prod
DB_SSL=false
JWT_SECRET=REPLACE_WITH_GENERATED_RANDOM_JWT_SECRET
JWT_EXPIRES_IN=1h
CORS_ORIGINS=https://your-real-frontend.example
SWAGGER_ENABLED=false
```

Then restrict access:

```bash
chmod 600 .env.production
```

Requirements:
- `DB_PASSWORD` must be unique to this deployment.
- `JWT_SECRET` must be a cryptographically random value at least 32 characters long. Never use a checked-in example or development secret.
- `CORS_ORIGINS` must be a comma-separated list of exact trusted origins, including scheme and port if nonstandard; do not use `*` with credentials.
- `DB_SSL=false` is only for the bundled PostgreSQL service on the private Compose network. For an external managed database, configure its TLS and certificate verification explicitly in that deployment's environment and networking; do not blindly reuse this bundled-DB Compose configuration.
- Configure any required object-storage and AI provider credentials through your secret manager and the application's supported environment variables before enabling those features. Do not add secrets to the image or source control.

## 3. First deployment and subsequent releases

From the repository directory on the deployment host:

```bash
# Validate required values and rendered configuration; does not start containers.
docker compose --env-file .env.production -f docker-compose.prod.yml config --quiet

# Review backups and confirm the target database is the intended production database.
# On a fresh database, Compose runs the migration service before starting the API.
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build

# Confirm the migration job completed successfully and the API is healthy.
docker compose --env-file .env.production -f docker-compose.prod.yml ps
docker compose --env-file .env.production -f docker-compose.prod.yml logs --no-color migrate
docker compose --env-file .env.production -f docker-compose.prod.yml logs --no-color api
curl --fail http://127.0.0.1:3000/health
```

The API depends on the migration service completing successfully. A migration error must block API startup; do not bypass it by enabling TypeORM `synchronize` in production.

The supported migration command inside the built image is:

```bash
node dist/database/run-migrations.js
```

For CI/local verification after building:

```bash
npm run build
npm run migration:run
npm run migration:smoke
```

The migrations are ordered and tracked in TypeORM's `migrations` table. They are intended to build a fresh database from the repository's four legacy migrations and the schema-completion migration. **Do not run this fresh-install path against an existing database that has tables but no matching TypeORM migration history.** Back up and inspect that database, compare its schema/data with the migration history, and create an explicitly reviewed baseline/adoption plan first. Never drop the production volume to make migrations pass.

Before each release, take and verify a restorable database backup, review migration SQL, apply changes in staging, and have a rollback/recovery plan. The down migration may remove tables introduced by the schema-completion migration and columns added to users; do not run it against production without a reviewed data recovery plan.

## 4. Production security boundaries

- Use the production file `docker-compose.prod.yml`, not `docker-compose.yml` or development overrides.
- PostgreSQL has no published host port; keep the Docker host and database volume access restricted.
- API port 3000 is loopback-bound; expose public traffic only through a TLS reverse proxy.
- API container runs as non-root with a read-only root filesystem, dropped Linux capabilities and `no-new-privileges`.
- Swagger is disabled by default. Enable it only deliberately and protect access at the reverse proxy.
- Keep `.env.production` outside source control; rotate any credential that was ever committed, even if the file was later deleted.
- Configure host firewalling, database encryption at rest, encrypted/off-host backups, monitoring, log retention, and tested disaster recovery before production use.

## 5. Post-deployment checks

```bash
curl --fail https://your-api-domain.example/health
docker compose --env-file .env.production -f docker-compose.prod.yml ps
docker compose --env-file .env.production -f docker-compose.prod.yml logs --since=15m api migrate
```

Verify login/registration, authorization boundaries, database read/write behavior, object storage, and any enabled AI integrations using test accounts. Do not use real users' data for smoke tests.

## 6. Development configuration warning

`docker-compose.yml` is for local development only. It may publish infrastructure ports and contain development service defaults. Production deployments must explicitly pass `-f docker-compose.prod.yml` and `--env-file .env.production` as shown above.

Last reviewed: 2026-10-23.
