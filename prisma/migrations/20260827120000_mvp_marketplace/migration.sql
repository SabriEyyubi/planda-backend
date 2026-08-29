CREATE TYPE "UnitStatus" AS ENUM ('AVAILABLE', 'RESERVED', 'SOLD');
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'CONTACTED', 'QUALIFIED', 'CLOSED');
CREATE TYPE "PreferredLanguage" AS ENUM ('TR', 'EN', 'AR', 'RU');

ALTER TABLE "organizations" ADD COLUMN "verified_at" TIMESTAMPTZ(3);
ALTER TABLE "projects"
  ADD COLUMN "summary" TEXT,
  ADD COLUMN "hero_image_url" VARCHAR(1000),
  ADD COLUMN "stock_updated_at" TIMESTAMPTZ(3),
  ADD COLUMN "price_updated_at" TIMESTAMPTZ(3);

CREATE TABLE "units" (
  "id" UUID NOT NULL,
  "project_id" UUID NOT NULL,
  "unit_number" VARCHAR(80) NOT NULL,
  "block" VARCHAR(80),
  "floor" INTEGER,
  "room_type" VARCHAR(40) NOT NULL,
  "net_area" DECIMAL(10,2) NOT NULL,
  "gross_area" DECIMAL(10,2),
  "price" DECIMAL(19,4) NOT NULL,
  "currency" CHAR(3) NOT NULL,
  "status" "UnitStatus" NOT NULL DEFAULT 'AVAILABLE',
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "units_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "units_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "units_project_id_unit_number_key" ON "units"("project_id", "unit_number");
CREATE INDEX "units_project_id_status_room_type_idx" ON "units"("project_id", "status", "room_type");

CREATE TABLE "payment_plans" (
  "id" UUID NOT NULL,
  "project_id" UUID NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "down_payment_percent" DECIMAL(5,2) NOT NULL,
  "term_months" INTEGER NOT NULL,
  "delivery_percent" DECIMAL(5,2) NOT NULL DEFAULT 0,
  "is_recommended" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "payment_plans_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payment_plans_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "payment_plans_project_id_name_key" ON "payment_plans"("project_id", "name");
CREATE INDEX "payment_plans_project_id_idx" ON "payment_plans"("project_id");

CREATE TABLE "leads" (
  "id" UUID NOT NULL,
  "project_id" UUID NOT NULL,
  "buyer_user_id" UUID NOT NULL,
  "idempotency_key" VARCHAR(100) NOT NULL,
  "full_name" VARCHAR(160) NOT NULL,
  "phone" VARCHAR(32) NOT NULL,
  "email" CITEXT,
  "preferred_language" "PreferredLanguage" NOT NULL,
  "unit_preference" VARCHAR(40),
  "budget_min" DECIMAL(19,4),
  "budget_max" DECIMAL(19,4),
  "currency" CHAR(3) NOT NULL DEFAULT 'TRY',
  "consent_version" VARCHAR(50) NOT NULL,
  "consented_at" TIMESTAMPTZ(3) NOT NULL,
  "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
  "closed_reason" VARCHAR(240),
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "leads_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "leads_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "leads_buyer_user_id_fkey" FOREIGN KEY ("buyer_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "leads_buyer_user_id_idempotency_key_key" ON "leads"("buyer_user_id", "idempotency_key");
CREATE INDEX "leads_project_id_status_created_at_idx" ON "leads"("project_id", "status", "created_at");

CREATE TABLE "saved_projects" (
  "user_id" UUID NOT NULL,
  "project_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "saved_projects_pkey" PRIMARY KEY ("user_id", "project_id"),
  CONSTRAINT "saved_projects_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "saved_projects_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "saved_projects_user_id_created_at_idx" ON "saved_projects"("user_id", "created_at");

CREATE TABLE "broker_offers" (
  "project_id" UUID NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "broker_price" DECIMAL(19,4),
  "commission_percent" DECIMAL(5,2),
  "reservation_hours" INTEGER,
  "sales_contact" VARCHAR(200),
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "broker_offers_pkey" PRIMARY KEY ("project_id"),
  CONSTRAINT "broker_offers_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "broker_offers_enabled_updated_at_idx" ON "broker_offers"("enabled", "updated_at");

CREATE TABLE "project_materials" (
  "id" UUID NOT NULL,
  "project_id" UUID NOT NULL,
  "title" VARCHAR(160) NOT NULL,
  "kind" VARCHAR(40) NOT NULL,
  "download_url" VARCHAR(1000) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "project_materials_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "project_materials_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "project_materials_project_id_created_at_idx" ON "project_materials"("project_id", "created_at");
