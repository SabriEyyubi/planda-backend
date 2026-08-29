CREATE EXTENSION IF NOT EXISTS citext;

CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'ARCHIVED');

ALTER TABLE "users"
  ALTER COLUMN "email" TYPE CITEXT,
  ADD COLUMN "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "security_version" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "auth_sessions"
  ADD COLUMN "absolute_expires_at" TIMESTAMPTZ(3);
UPDATE "auth_sessions" SET "absolute_expires_at" = "expires_at";
ALTER TABLE "auth_sessions" ALTER COLUMN "absolute_expires_at" SET NOT NULL;
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_expiry_order_check"
  CHECK ("expires_at" <= "absolute_expires_at");

CREATE TABLE "provinces" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "code" VARCHAR(32) NOT NULL,
  "name" VARCHAR(100) NOT NULL,
  "slug" VARCHAR(100) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "provinces_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "provinces_code_key" ON "provinces"("code");
CREATE UNIQUE INDEX "provinces_slug_key" ON "provinces"("slug");

CREATE TABLE "districts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "province_id" UUID NOT NULL,
  "code" VARCHAR(32) NOT NULL,
  "name" VARCHAR(100) NOT NULL,
  "slug" VARCHAR(100) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "districts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "districts_code_key" ON "districts"("code");
CREATE UNIQUE INDEX "districts_province_id_slug_key" ON "districts"("province_id", "slug");
CREATE UNIQUE INDEX "districts_id_province_id_key" ON "districts"("id", "province_id");
CREATE INDEX "districts_province_id_name_idx" ON "districts"("province_id", "name");
ALTER TABLE "districts" ADD CONSTRAINT "districts_province_id_fkey"
  FOREIGN KEY ("province_id") REFERENCES "provinces"("id") ON DELETE RESTRICT;

-- Preserve any pre-hardening project rows. These LEGACY codes must be remapped to
-- authoritative location codes before production publication.
INSERT INTO "provinces" ("id", "code", "name", "slug", "updated_at")
SELECT gen_random_uuid(), 'LEGACY-' || SUBSTRING(md5("city") FOR 20), "city",
       'legacy-' || SUBSTRING(md5("city") FOR 20), CURRENT_TIMESTAMP
FROM "projects" GROUP BY "city";

INSERT INTO "districts" ("id", "province_id", "code", "name", "slug", "updated_at")
SELECT gen_random_uuid(), p."id",
       'LEGACY-' || SUBSTRING(md5(pr."city" || ':' || pr."district") FOR 20),
       pr."district", 'legacy-' || SUBSTRING(md5(pr."district") FOR 20), CURRENT_TIMESTAMP
FROM (SELECT DISTINCT "city", "district" FROM "projects") pr
JOIN "provinces" p ON p."code" = 'LEGACY-' || SUBSTRING(md5(pr."city") FOR 20);

ALTER TABLE "projects"
  ADD COLUMN "province_id" UUID,
  ADD COLUMN "district_id" UUID,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

UPDATE "projects" project
SET "province_id" = province."id", "district_id" = district."id"
FROM "provinces" province, "districts" district
WHERE province."code" = 'LEGACY-' || SUBSTRING(md5(project."city") FOR 20)
  AND district."province_id" = province."id"
  AND district."code" = 'LEGACY-' || SUBSTRING(md5(project."city" || ':' || project."district") FOR 20);

ALTER TABLE "projects" ALTER COLUMN "province_id" SET NOT NULL;
ALTER TABLE "projects" ALTER COLUMN "district_id" SET NOT NULL;
DROP INDEX "projects_city_district_status_idx";
ALTER TABLE "projects" DROP COLUMN "city", DROP COLUMN "district";
CREATE INDEX "projects_province_id_district_id_status_idx"
  ON "projects"("province_id", "district_id", "status");
ALTER TABLE "projects" ADD CONSTRAINT "projects_province_id_fkey"
  FOREIGN KEY ("province_id") REFERENCES "provinces"("id") ON DELETE RESTRICT;
ALTER TABLE "projects" ADD CONSTRAINT "projects_district_id_province_id_fkey"
  FOREIGN KEY ("district_id", "province_id") REFERENCES "districts"("id", "province_id") ON DELETE RESTRICT;

ALTER TABLE "audit_logs"
  ADD COLUMN "ip_address" INET,
  ADD COLUMN "user_agent" VARCHAR(500);
ALTER TABLE "audit_logs" DROP CONSTRAINT "audit_logs_actor_user_id_fkey";
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey"
  FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION prevent_audit_log_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "audit_logs_append_only"
BEFORE UPDATE OR DELETE ON "audit_logs"
FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();
