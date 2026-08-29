CREATE TYPE "BrokerClientStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

ALTER TABLE "organizations"
  ADD COLUMN "sales_email" CITEXT,
  ADD COLUMN "sales_phone" VARCHAR(16),
  ADD COLUMN "website_url" VARCHAR(1000),
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE "project_engagement_daily" (
  "project_id" UUID NOT NULL,
  "date" DATE NOT NULL,
  "views" INTEGER NOT NULL DEFAULT 0,
  "favorite_adds" INTEGER NOT NULL DEFAULT 0,
  "leads" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "project_engagement_daily_pkey" PRIMARY KEY ("project_id", "date"),
  CONSTRAINT "project_engagement_daily_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "project_engagement_daily_date_project_id_idx" ON "project_engagement_daily"("date", "project_id");
CREATE INDEX "saved_projects_project_id_created_at_idx" ON "saved_projects"("project_id", "created_at");

CREATE TABLE "broker_clients" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "created_by_id" UUID NOT NULL,
  "full_name" VARCHAR(160) NOT NULL,
  "phone" VARCHAR(16),
  "email" CITEXT,
  "notes" VARCHAR(2000),
  "status" "BrokerClientStatus" NOT NULL DEFAULT 'ACTIVE',
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "broker_clients_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "broker_clients_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "broker_clients_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "broker_clients_organization_id_status_updated_at_id_idx" ON "broker_clients"("organization_id", "status", "updated_at", "id");

ALTER TABLE "project_media"
  ADD COLUMN "storage_key" VARCHAR(1000),
  ADD COLUMN "mime_type" VARCHAR(100),
  ADD COLUMN "file_size_bytes" BIGINT,
  ADD COLUMN "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

UPDATE "project_media"
SET "storage_key" = 'legacy/' || "id"::text,
    "mime_type" = 'image/jpeg',
    "file_size_bytes" = 0;

ALTER TABLE "project_media"
  ALTER COLUMN "storage_key" SET NOT NULL,
  ALTER COLUMN "mime_type" SET NOT NULL,
  ALTER COLUMN "file_size_bytes" SET NOT NULL;
CREATE UNIQUE INDEX "project_media_storage_key_key" ON "project_media"("storage_key");

CREATE TABLE "media_deletions" (
  "media_id" UUID NOT NULL,
  "project_id" UUID NOT NULL,
  "storage_key" VARCHAR(1000) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "media_deletions_pkey" PRIMARY KEY ("media_id")
);
