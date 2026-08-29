CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TYPE "PlatformRole" AS ENUM ('BUYER', 'DEVELOPER_MEMBER', 'BROKER', 'ADMIN', 'SUPER_ADMIN');
CREATE TYPE "OrganizationType" AS ENUM ('DEVELOPER', 'BROKER_AGENCY', 'PLATFORM');
CREATE TYPE "OrganizationStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'ARCHIVED');
CREATE TYPE "MembershipRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');
CREATE TYPE "ProjectStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'PUBLISHED', 'ARCHIVED');

CREATE TABLE "users" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "email" VARCHAR(320) NOT NULL,
  "password_hash" TEXT NOT NULL, "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL, CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

CREATE TABLE "user_platform_roles" (
  "user_id" UUID NOT NULL, "role" "PlatformRole" NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_platform_roles_pkey" PRIMARY KEY ("user_id", "role")
);
CREATE INDEX "user_platform_roles_role_idx" ON "user_platform_roles"("role");

CREATE TABLE "organizations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "name" VARCHAR(200) NOT NULL,
  "slug" VARCHAR(200) NOT NULL, "type" "OrganizationType" NOT NULL,
  "status" "OrganizationStatus" NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL, CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");
CREATE INDEX "organizations_type_status_idx" ON "organizations"("type", "status");

CREATE TABLE "organization_memberships" (
  "user_id" UUID NOT NULL, "organization_id" UUID NOT NULL, "role" "MembershipRole" NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "organization_memberships_pkey" PRIMARY KEY ("user_id", "organization_id")
);
CREATE INDEX "organization_memberships_organization_id_role_idx" ON "organization_memberships"("organization_id", "role");

CREATE TABLE "auth_sessions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "user_id" UUID NOT NULL,
  "expires_at" TIMESTAMPTZ(3) NOT NULL, "revoked_at" TIMESTAMPTZ(3), "compromised_at" TIMESTAMPTZ(3),
  "user_agent" VARCHAR(500), "ip_address" INET,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "auth_sessions_user_id_revoked_at_idx" ON "auth_sessions"("user_id", "revoked_at");

CREATE TABLE "refresh_tokens" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "session_id" UUID NOT NULL, "token_hash" CHAR(64) NOT NULL,
  "expires_at" TIMESTAMPTZ(3) NOT NULL, "used_at" TIMESTAMPTZ(3), "revoked_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");
CREATE INDEX "refresh_tokens_session_id_created_at_idx" ON "refresh_tokens"("session_id", "created_at");

CREATE TABLE "projects" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "developer_organization_id" UUID NOT NULL,
  "name" VARCHAR(200) NOT NULL, "slug" VARCHAR(200) NOT NULL,
  "status" "ProjectStatus" NOT NULL DEFAULT 'DRAFT', "city" VARCHAR(100) NOT NULL,
  "district" VARCHAR(100) NOT NULL, "latitude" DECIMAL(9,6) NOT NULL, "longitude" DECIMAL(9,6) NOT NULL,
  "location" geometry(Point,4326) GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint("longitude"::double precision, "latitude"::double precision), 4326)) STORED,
  "starting_price" DECIMAL(19,4) NOT NULL, "currency" CHAR(3) NOT NULL,
  "delivery_date" DATE, "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL, CONSTRAINT "projects_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "projects_latitude_check" CHECK ("latitude" BETWEEN -90 AND 90),
  CONSTRAINT "projects_longitude_check" CHECK ("longitude" BETWEEN -180 AND 180),
  CONSTRAINT "projects_starting_price_check" CHECK ("starting_price" >= 0),
  CONSTRAINT "projects_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$')
);
CREATE UNIQUE INDEX "projects_slug_key" ON "projects"("slug");
CREATE INDEX "projects_status_created_at_idx" ON "projects"("status", "created_at");
CREATE INDEX "projects_city_district_status_idx" ON "projects"("city", "district", "status");
CREATE INDEX "projects_developer_organization_id_status_idx" ON "projects"("developer_organization_id", "status");
CREATE INDEX "projects_location_gist_idx" ON "projects" USING GIST ("location");

CREATE TABLE "audit_logs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "actor_user_id" UUID, "organization_id" UUID,
  "action" VARCHAR(100) NOT NULL, "entity_type" VARCHAR(100) NOT NULL, "entity_id" UUID NOT NULL,
  "before" JSONB, "after" JSONB, "request_id" VARCHAR(100),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "audit_logs_entity_type_entity_id_created_at_idx" ON "audit_logs"("entity_type", "entity_id", "created_at");
CREATE INDEX "audit_logs_actor_user_id_created_at_idx" ON "audit_logs"("actor_user_id", "created_at");

ALTER TABLE "user_platform_roles" ADD CONSTRAINT "user_platform_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "auth_sessions"("id") ON DELETE CASCADE;
ALTER TABLE "projects" ADD CONSTRAINT "projects_developer_organization_id_fkey" FOREIGN KEY ("developer_organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL;
