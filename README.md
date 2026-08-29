# PLANDA Product API

Production-oriented backend foundation for PLANDA, a Turkey-focused developer-originated new-property marketplace. This is a shared REST API for web, iOS, Android, developer, broker, and admin clients—not a web-specific backend.

## Architecture

The application is a pragmatic modular monolith. NestJS modules own cohesive product capabilities while PostgreSQL and Redis infrastructure stay behind shared infrastructure adapters. Controllers validate and translate HTTP contracts; services own use cases and explicit authorization; Prisma owns persistence. See [docs/architecture.md](docs/architecture.md).

Implemented modules:

- `identity`: buyer registration, login, rotating multi-device refresh sessions, logout, current user
- `projects`: public project reads, developer draft management, admin publication workflow
- `locations`: canonical province and district reference API
- `marketplace`: buyer leads/saved projects, developer inventory/payment plans/lead pipeline, role-isolated broker catalogue
- `health`: liveness and PostgreSQL/Redis readiness
- infrastructure: Prisma/PostgreSQL/PostGIS and Redis
- cross-cutting: typed startup configuration, request IDs, structured request logging, error contract, validation, CORS, Helmet, rate-limit foundation, OpenAPI

Modules remain in one deployable process while boundaries are kept explicit. A module should be extracted only after operational scaling, ownership, deployment cadence, or fault-isolation evidence makes a separate service worth its distributed-system cost.

## Technology

Node.js 22+, TypeScript 5.9, NestJS 11, PostgreSQL 17 + PostGIS 3.5, Prisma 6.19, Redis 8, Swagger/OpenAPI, Jest, ESLint, Prettier, and pnpm.

## Structure

```text
src/
  common/           configuration, HTTP concerns, guards, shared types
  infrastructure/   Prisma database and Redis adapters
  modules/
    health/
    identity/
    locations/
    marketplace/
    projects/
prisma/             schema, migrations, development seed
test/               database-backed e2e tests
docs/               architectural decisions
```

Folders are added only when they contain a current responsibility.

## Local setup

Prerequisites: Node.js 22+, pnpm, and Docker with Compose.

On Apple Silicon, Docker Desktop runs the official PostGIS development image
through amd64 emulation because that image does not publish an arm64 manifest.

```bash
cp .env.example .env
docker compose up -d postgres redis
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm start:dev
```

The local port contract is Next.js web `3000` and API `3001`. Docker Compose currently starts
only PostgreSQL and Redis; the API is run with `pnpm start:dev`.

API base URL: `http://localhost:3001/api/v1`  
Development OpenAPI UI: `http://localhost:3001/api/docs`  
OpenAPI JSON: `http://localhost:3001/api/docs/openapi.json`

Generate the deterministic frontend contract without developer secrets or running infrastructure:

```bash
pnpm api:contract
```

The generated artifact is `openapi/openapi.json`. Frontend generation should consume this file.

Environment is validated at startup. `CORS_ORIGINS` is a comma-separated exact allowlist and never accepts `*`. When empty in development, only known localhost frontend origins are allowed. It is mandatory in production. JWT secrets require at least 32 characters. New lead submissions must send the exact backend `LEAD_CONSENT_CURRENT_VERSION`; `LEAD_CONSENT_APPROVED_VERSIONS` is the comma-separated backend allowlist and must contain the current version. The Next.js client contract is `NEXT_PUBLIC_LEAD_CONSENT_VERSION`, whose deployed value must equal backend `LEAD_CONSENT_CURRENT_VERSION`.

Refresh rotation is coordinated across API instances with Redis. `AUTH_REFRESH_ROTATION_GRACE_SECONDS` (default `5`, allowed `1..30`) controls the short replay window: concurrent requests with the same valid old refresh token receive the exact same token pair. Outside this window, reuse revokes the session family. Redis coordination failure returns `AUTH_REFRESH_COORDINATION_UNAVAILABLE` (`503`) before rotation and never marks the session compromised. The rotation stage atomically renews its owner-checked lease; the Prisma transaction is capped at 5 seconds while the lease is at least 10 seconds.

The old refresh token is never used as a Redis key and is never logged; only its SHA-256 hash identifies coordination keys. To replay the exact response, Redis temporarily contains the new `TokenPairDto` as plaintext JSON for the configured grace TTL (or, only during crash recovery, the bounded lease plus grace TTL). Redis is therefore part of the trusted credential boundary: production access must be private-network and ACL restricted, transport encryption must be used for remote Redis, persistence/backups should be disabled for these ephemeral keys, and operational tooling must not inspect or export their values.

## Database and PostGIS

PostgreSQL is authoritative. The initial migration installs PostGIS, stores API-facing coordinates as exact decimals, generates a `geometry(Point,4326)` column, and creates a GiST index. This permits future bounds/radius queries without reworking the base model.

```bash
pnpm db:migrate          # create/apply a development migration
pnpm db:migrate:deploy   # apply committed migrations in deployment
pnpm db:studio
```

Redis is non-authoritative and currently backs distributed rate limits and readiness checks. It remains suitable for caching, transient state, and future jobs.

## Development seed

`pnpm db:seed` is explicitly blocked when `NODE_ENV=production`. Seed data and credentials are development-only:

- `admin@planda.test` / `DevelopmentOnly!123`
- `developer@planda.test` / `DevelopmentOnly!123`
- `buyer@planda.test` / `DevelopmentOnly!123`
- `broker@planda.test` / `DevelopmentOnly!123`
- developer organization plus draft, review, and published sample projects

Never reuse these credentials or run the seed in production.

## Endpoints

Public/authentication:

- `POST /api/v1/auth/register` (always creates only `BUYER`)
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout` (immediately revokes one session)
- `GET /api/v1/auth/me`
- `GET /api/v1/health`
- `GET /api/v1/health/ready`
- `GET /api/v1/projects`
- `GET /api/v1/projects/:idOrSlug`
- `POST /api/v1/projects/:projectId/leads` (`BUYER`)
- `GET|PUT|DELETE /api/v1/me/saved-projects[/:projectId]` (`BUYER`)
- `GET /api/v1/locations/provinces`
- `GET /api/v1/locations/provinces/:provinceId/districts`

Protected project workflow:

- `POST /api/v1/developer/projects`
- `GET /api/v1/developer/overview`
- `GET /api/v1/developer/projects`
- `GET /api/v1/developer/projects/:projectId`
- `PATCH /api/v1/developer/projects/:id` (`DRAFT → IN_REVIEW` only)
- `PATCH /api/v1/admin/projects/:id/status` (`IN_REVIEW → PUBLISHED → ARCHIVED`)
- `GET|POST|PATCH /api/v1/developer/projects/:projectId/units[/:unitId]`
- `GET|POST /api/v1/developer/projects/:projectId/payment-plans`
- `PATCH|DELETE /api/v1/developer/projects/:projectId/payment-plans/:planId`
- `GET /api/v1/developer/leads`
- `PATCH /api/v1/developer/leads/:leadId`
- `GET /api/v1/broker/projects[/:idOrSlug]` (`BROKER`, private/no-store)
- `GET /api/v1/broker/projects/:idOrSlug/materials` (metadata only; no download URL)
- `GET /api/v1/admin/overview`
- `GET /api/v1/admin/projects/review-queue`
- `GET /api/v1/admin/data-quality`

Public reads never expose non-published projects or broker-only price, commission, contact, unit, or material data. Developer access requires both the `DEVELOPER_MEMBER` platform role and active membership in the target developer organization. Organization `OWNER` and `ADMIN` can manage projects; `MEMBER` is read-only. The explicit capability map can evolve toward granular permissions. Admin publication requires platform `ADMIN` or `SUPER_ADMIN`.

Money and coordinates are accepted and returned as decimal strings to avoid JSON floating-point precision loss. Dates are ISO 8601; timestamps are UTC.

## Authentication security

Passwords use Argon2id defaults. Each login/device creates a separate server-side session. Refresh tokens rotate on every use, only SHA-256 token hashes are stored, and replay marks the session compromised. The default inactivity window slides by seven days but never exceeds 30 days from first login. Access tokens contain the session ID and security version; protected requests validate current PostgreSQL state, so logout and security-critical invalidation take effect immediately.

Rate limits are atomic in Redis and shared by all instances. Register, login, refresh, and general API limits are separately configurable. Login tracking uses IP plus normalized email and hashes the tracker before Redis storage. Invalid login responses and Argon2 verification behavior do not reveal whether an email exists.

## Location, concurrency, and audit integrity

Projects reference canonical `Province` and `District` records. A composite foreign key guarantees that a district belongs to the selected province. The seed includes only a development subset; the authoritative nationwide code dataset remains a deployment data task.

Project mutations use optimistic compare-and-swap over status and version. Stale concurrent writes return a stable conflict instead of overwriting newer state. Pagination uses a stable `(createdAt, id)` keyset cursor.

Critical project mutations and full public-safe before/after audit snapshots share one transaction. Audit entries include request and actor context, and a PostgreSQL trigger rejects update/delete operations.

Developer, broker, and admin roles cannot be assigned by public registration. Invitation/approval and privileged role-management endpoints are deliberate future work.

## Quality commands

```bash
pnpm build
pnpm lint
pnpm format:check
pnpm test
pnpm test:e2e       # requires PostgreSQL/PostGIS and Redis from Docker Compose
```

Unit tests cover auth role/password behavior, strict input normalization/validation, public project visibility constraints, and status transitions. The e2e flow covers register → login → authenticated current-user request.

## Deliberate next steps

- invitation/approval and privileged role assignment
- logout-all-devices endpoint and session-management UI contract
- trusted-developer direct-publish capability (policy extension, not a bypass)
- authoritative nationwide province/district code import and maintenance
- PostGIS radius and polygon queries beyond the implemented rectangular map bounds filter
- broader idempotency coverage beyond lead creation
- audit browsing/retention tooling; writes already create immutable audit records for project lifecycle changes
- worker process using the same modules for jobs; no job system is introduced yet
- notifications, saved-search alerts, and AI review pipeline

## Growth MVP services

Developer analytics uses UTC daily aggregates. Public project-detail views are deduplicated in Redis by an HMAC of the first-party session, project and UTC day; the identifier and hash are never persisted. Set `ANALYTICS_SESSION_HASH_SECRET` to a unique secret in production.

Project images are private objects in an S3-compatible bucket and are served only through the published-project media endpoint. Local development uses the private MinIO service on ports 9000/9001. Accepted uploads are signature-checked JPEG, PNG or WebP files up to 10 MiB. Configure `STORAGE_ENDPOINT`, `STORAGE_REGION`, `STORAGE_BUCKET`, `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY`, `STORAGE_PUBLIC_BASE_URL` and `STORAGE_FORCE_PATH_STYLE` for production.

Broker CRM records are scoped to an active broker-agency membership and are soft archived. Developer settings and all broker/developer growth APIs send `private, no-store`; settings and media mutations require organization OWNER or ADMIN membership and optimistic versions.
