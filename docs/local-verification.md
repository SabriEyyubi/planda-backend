# Repeatable local verification

Use Node.js22 and the pnpm version declared by package.json. Install dependencies with the lockfile. Keep TLS certificate verification enabled; remove any NODE_TLS_REJECT_UNAUTHORIZED override.

These are local tests, not deployment or production-readiness approval. Use a dedicated PostgreSQL/PostGIS database, a separate Redis database and a dedicated object-storage bucket. Never point this suite at shared demo or production data. Do not run another browser/test suite against the same database concurrently: temporary published projects can affect catalogue counts.

Provide the normal environment configuration through your private shell or secret manager. Set DATABASE_URL, REDIS_URL, separate JWT secrets, storage credentials/endpoints/bucket, and matching test-only lead consent current/approved versions. Do not commit credentials or reuse a production consent approval for fixtures. Configure STORAGE_PUBLIC_BASE_URL for the API instance used by any browser journey. The Nest/Supertest suite itself allocates its HTTP server and does not require a fixed application port.

Set NODE_ENV=test and PLANDA_E2E_DATABASE_NAME to the exact dedicated database name from DATABASE_URL. The marketplace journey suite rejects non-test environments, non-loopback database hosts and missing/mismatched acknowledgement before initializing the application. This acknowledgement is an explicit operator assertion of isolation, not automatic proof that a database contains no valuable data. Keep these values process-local. The other legacy integration files also write data, so validate every connection before running the full suite.

Run against a newly created test database:

```sh
pnpm db:generate
pnpm db:migrate:deploy
pnpm db:seed
pnpm storage:ensure-bucket
pnpm test --runInBand
pnpm lint
pnpm build
pnpm test:e2e
pnpm test:e2e
```

Use the ordinary development seed, not demo:catalog. Existing assertions expect six published projects. The development seed provides local fixture accounts; its credentials are for isolated testing only and should not be copied into reports. Capture output privately.

The two consecutive integration runs verify repeatability rather than retrying a failure. Stop on a failure, retain its original log, investigate the cause and apply the normal repair/retest process. Do not disable rate limits, weaken assertions or flush shared services to obtain a pass.

The marketplace suite covers actual PostgreSQL lock contention and resulting inventory prices, stale lead update precedence, and private selected-plan/message persistence with idempotency and cross-project rejection. It creates unique temporary projects and removes only its own leads/projects. Seed project identities are checked after cleanup. Append-only audit rows are retained intentionally; database teardown, when wanted, means separately deleting the entire explicitly disposable test environment, never disabling audit triggers. Keep at least four database connections available for the transaction barrier, two queued mutations and the observation query.

After a successful build, start the built API using start:prod with the same local test environment and check its health/ready endpoint. It must report PostgreSQL, Redis and storage up. The command name start:prod selects built JavaScript; NODE_ENV=test is intentional for local storage. Production storage validation remains stricter. Browser journeys require a production frontend build bound to this API, mock fallback disabled, matching test-only consent configuration and a separate browser evidence record. A passing backend suite alone does not prove browser or production readiness.
