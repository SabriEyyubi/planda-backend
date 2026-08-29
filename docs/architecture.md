# PLANDA backend architecture decisions

## Modular monolith

PLANDA starts as one NestJS deployment with domain-oriented modules. This keeps transactions, local development, observability, and delivery simple while product rules are still evolving. Modules own controllers and use-case services; shared infrastructure exposes narrow database and Redis capabilities. New product areas should become modules, not additions to a giant application service.

Extraction into a service is justified only by measured independent scaling, materially different availability/security needs, a stable boundary with clear data ownership, or an independent team/deployment cadence. Extraction must define an API and data ownership first; shared-table services are not the target architecture.

## API-first and client-agnostic

`/api/v1` is the product contract for web, Swift, Kotlin, developer, broker, and admin clients. It uses bearer tokens, predictable REST responses, UUIDs, ISO 8601 timestamps, cursor pagination, and decimal strings for exact values. It assumes neither cookies nor HTML/Next.js behavior. DTOs and Swagger metadata are the OpenAPI source of truth for future generated clients.

Breaking contracts require a new API version. Additive optional fields can evolve within v1. Database models never serve directly as public response objects.

## Data ownership

PostgreSQL is the sole authoritative business store. Redis may contain caches, rate-limit state, transient coordination, or job data, but loss of Redis must not change authoritative business truth. AI-derived content must enter as a draft, pass validation and human review, then be published through normal domain rules.

## Identity and authorization

Users have many platform roles through `UserPlatformRole`. Public registration grants only `BUYER`. Organization access is separately represented by `OrganizationMembership` with `OWNER`, `ADMIN`, or `MEMBER`; membership is never inferred from a platform role.

Authorization is enforced in backend guards and services. Guards check coarse platform roles. Services check resource ownership, organization type/status, membership, and status transitions. Future permissions or trusted-developer direct publication should extend policy inputs rather than weaken these checks.

Each device/login owns an `AuthSession`. Refresh JWTs rotate, only hashes are persisted, token history provides reuse detection, and replay compromises only that session family. Sliding inactivity expiry is capped by an immutable 30-day deadline. Access tokens contain `sessionId` and `securityVersion`; PostgreSQL session/user validation provides immediate revocation. A shared transactional invalidation service supports future role and permission mutations.

Organization capability mapping grants project management to `OWNER` and `ADMIN`; `MEMBER` is read-only. This explicit mapping can later be supplemented or replaced by granular capabilities.

## Publication and audit

The initial lifecycle is deterministic:

```text
Developer: DRAFT → IN_REVIEW
Admin:     IN_REVIEW → PUBLISHED → ARCHIVED
```

Developers cannot publish directly. Project creation, edits, submission, publication, and archival create public-safe before/after snapshots in the same transaction as the change. A PostgreSQL trigger rejects audit update/delete operations. This is conventional audit logging—not event sourcing. A later audit module may add query, partitioning, retention, and controlled archival policies.

Project writes use optimistic version and expected-status predicates, preventing stale writes and simultaneous invalid transitions.

## PostGIS direction

PostGIS is installed by the first migration. Projects retain exact decimal latitude/longitude for a clear API contract, while PostgreSQL generates a WGS84 `geometry(Point,4326)` column and maintains a GiST index. Future map bounds, distance, clustering, and coverage queries should use PostGIS operators through focused query components; no custom geo engine is planned.

## Mobile compatibility

The API avoids browser cookies, wraps only pagination metadata where needed, uses UTC timestamps and explicit nullable fields, returns compact resource DTOs, and uses stable IDs. Future media objects must return absolute CDN-suitable URLs and dimensions. Critical writes such as lead submission or payment intent will add persisted idempotency keys when those use cases are introduced.

## Logging and errors

Every request receives or safely propagates `x-request-id`, echoes it in the response, and includes it in structured JSON logs and API errors. Expected API failures use stable machine codes; production responses do not expose stacks. Passwords and tokens are never logged. Rate limits are atomically maintained in Redis across instances and fail closed when protection storage is unavailable; PostgreSQL remains authoritative.

## Future workers

Long-running imports, media processing, notifications, and AI extraction should run in a separately launched worker process that imports application modules and uses Redis-backed job infrastructure when the work exists. Workers must validate drafts and write through domain services. Kafka, RabbitMQ, CQRS frameworks, and microservices are intentionally absent.
