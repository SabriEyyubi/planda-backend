# Public and buyer API migration

Migration: `20260827143000_public_buyer_completion`

## Deployment

1. Back up PostgreSQL and record the currently deployed migration.
2. Apply the migration with `pnpm db:migrate:deploy` before deploying the API.
3. Verify `pnpm exec prisma migrate status` and API readiness.
4. Deploy the backward-compatible API. New project-detail arrays are additive;
   projects without the new records return empty arrays.

The migration backfills existing lead request hashes with a deterministic
legacy value before making the column required. New API writes replace this
compatibility value with a SHA-256 hash of the normalized request payload.

## Rollback and forward-fix

Prefer a forward-fix after traffic has used the new fields. Rolling the schema
back removes gallery, amenity, point-of-interest and payment-plan detail data.
If rollback is unavoidable, first deploy the previous API, export the new
tables/columns, then in a controlled maintenance window:

1. Drop the new project media, amenity and point-of-interest tables.
2. Restore the old lead unique index on `(buyer_user_id, idempotency_key)` only
   after checking that no key is repeated across projects for the same buyer.
3. Drop the new lead constraints and `request_hash` column.
4. Drop the added unit/payment-plan/project columns and constraints.
5. Drop the `ConstructionStatus` enum after the project column is removed.

Do not perform the lead-index rollback when the duplicate-key preflight finds
rows; keep the new schema and forward-fix instead.
