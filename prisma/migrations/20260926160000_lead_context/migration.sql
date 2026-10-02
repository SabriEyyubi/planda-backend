-- Nullable snapshots preserve existing leads and plan context after a plan is removed.
ALTER TABLE "leads"
  ADD COLUMN "payment_plan_id" UUID,
  ADD COLUMN "payment_plan_name" VARCHAR(120),
  ADD COLUMN "message" VARCHAR(1000);
