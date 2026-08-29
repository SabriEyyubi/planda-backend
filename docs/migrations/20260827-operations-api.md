# Operations API migration

Migration: `20260827160000_operations_api`

Deploy the migration before the operations API. It is additive: payment plans
receive version `1`, existing material metadata receives safe defaults, and the
per-unit broker terms table starts empty. The API falls back to project-level
broker terms when no unit override exists.

Prefer a forward-fix after operations traffic begins. A controlled rollback
must first deploy the previous API, export broker-unit terms and material
metadata, then drop `broker_unit_terms`, remove the material metadata columns,
and remove `payment_plans.version`. Dropping the version column discards
optimistic-concurrency history and must not happen while the new API is live.
