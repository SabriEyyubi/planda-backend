CREATE TYPE "ConstructionStatus" AS ENUM ('PLANNED', 'UNDER_CONSTRUCTION', 'READY');

ALTER TABLE "projects"
  ADD COLUMN "construction_status" "ConstructionStatus" NOT NULL DEFAULT 'PLANNED';

ALTER TABLE "units"
  ADD COLUMN "orientation" VARCHAR(40),
  ADD COLUMN "floor_plan_image_url" VARCHAR(1000),
  ADD CONSTRAINT "units_net_area_positive_check" CHECK ("net_area" > 0),
  ADD CONSTRAINT "units_gross_area_valid_check" CHECK ("gross_area" IS NULL OR "gross_area" >= "net_area"),
  ADD CONSTRAINT "units_price_positive_check" CHECK ("price" > 0),
  ADD CONSTRAINT "units_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$');

ALTER TABLE "payment_plans"
  ADD COLUMN "monthly_payment" DECIMAL(19,4),
  ADD COLUMN "total_price" DECIMAL(19,4),
  ADD COLUMN "cash_discount_percent" DECIMAL(5,2),
  ADD COLUMN "timeline_note" VARCHAR(500),
  ADD CONSTRAINT "payment_plans_percentages_check" CHECK (
    "down_payment_percent" BETWEEN 0 AND 100
    AND "delivery_percent" BETWEEN 0 AND 100
    AND "down_payment_percent" + "delivery_percent" <= 100
  ),
  ADD CONSTRAINT "payment_plans_term_check" CHECK ("term_months" BETWEEN 0 AND 120),
  ADD CONSTRAINT "payment_plans_monthly_payment_check" CHECK ("monthly_payment" IS NULL OR "monthly_payment" >= 0),
  ADD CONSTRAINT "payment_plans_total_price_check" CHECK ("total_price" IS NULL OR "total_price" >= 0),
  ADD CONSTRAINT "payment_plans_cash_discount_check" CHECK (
    "cash_discount_percent" IS NULL OR "cash_discount_percent" BETWEEN 0 AND 100
  );

ALTER TABLE "leads" ADD COLUMN "request_hash" CHAR(64);
UPDATE "leads"
SET "request_hash" = md5("buyer_user_id"::text || ':' || "project_id"::text || ':' || "idempotency_key")
  || md5('legacy:' || "buyer_user_id"::text || ':' || "project_id"::text || ':' || "idempotency_key");
ALTER TABLE "leads"
  ALTER COLUMN "request_hash" SET NOT NULL,
  ADD CONSTRAINT "leads_request_hash_check" CHECK ("request_hash" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "leads_budget_check" CHECK (
    ("budget_min" IS NULL OR "budget_min" >= 0)
    AND ("budget_max" IS NULL OR "budget_max" >= 0)
    AND ("budget_min" IS NULL OR "budget_max" IS NULL OR "budget_min" <= "budget_max")
  ),
  ADD CONSTRAINT "leads_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT "leads_phone_e164_check" CHECK ("phone" ~ '^\+[1-9][0-9]{7,14}$');
DROP INDEX "leads_buyer_user_id_idempotency_key_key";
CREATE UNIQUE INDEX "leads_buyer_user_id_project_id_idempotency_key_key"
  ON "leads"("buyer_user_id", "project_id", "idempotency_key");

CREATE TABLE "project_media" (
  "id" UUID NOT NULL,
  "project_id" UUID NOT NULL,
  "kind" VARCHAR(40) NOT NULL,
  "url" VARCHAR(1000) NOT NULL,
  "alt_text" VARCHAR(240),
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "project_media_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "project_media_sort_order_check" CHECK ("sort_order" >= 0),
  CONSTRAINT "project_media_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "project_media_project_id_sort_order_id_idx" ON "project_media"("project_id", "sort_order", "id");

CREATE TABLE "project_amenities" (
  "id" UUID NOT NULL,
  "project_id" UUID NOT NULL,
  "code" VARCHAR(80) NOT NULL,
  "label" VARCHAR(160) NOT NULL,
  CONSTRAINT "project_amenities_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "project_amenities_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "project_amenities_project_id_code_key" ON "project_amenities"("project_id", "code");
CREATE INDEX "project_amenities_code_project_id_idx" ON "project_amenities"("code", "project_id");

CREATE TABLE "project_points_of_interest" (
  "id" UUID NOT NULL,
  "project_id" UUID NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "category" VARCHAR(80) NOT NULL,
  "distance_meters" INTEGER NOT NULL,
  CONSTRAINT "project_points_of_interest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "project_points_of_interest_distance_check" CHECK ("distance_meters" >= 0),
  CONSTRAINT "project_points_of_interest_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "project_points_of_interest_project_id_distance_meters_id_idx"
  ON "project_points_of_interest"("project_id", "distance_meters", "id");
