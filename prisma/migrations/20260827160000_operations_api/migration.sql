ALTER TABLE "payment_plans" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "project_materials"
  ADD COLUMN "language" "PreferredLanguage" NOT NULL DEFAULT 'TR',
  ADD COLUMN "version_label" VARCHAR(40) NOT NULL DEFAULT '1',
  ADD COLUMN "file_size_bytes" BIGINT,
  ADD COLUMN "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD CONSTRAINT "project_materials_file_size_check" CHECK (
    "file_size_bytes" IS NULL OR "file_size_bytes" >= 0
  );

CREATE TABLE "broker_unit_terms" (
  "unit_id" UUID NOT NULL,
  "broker_price" DECIMAL(19,4),
  "commission_percent" DECIMAL(5,2),
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "broker_unit_terms_pkey" PRIMARY KEY ("unit_id"),
  CONSTRAINT "broker_unit_terms_price_check" CHECK (
    "broker_price" IS NULL OR "broker_price" > 0
  ),
  CONSTRAINT "broker_unit_terms_commission_check" CHECK (
    "commission_percent" IS NULL OR "commission_percent" BETWEEN 0 AND 100
  ),
  CONSTRAINT "broker_unit_terms_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "broker_unit_terms_updated_at_idx" ON "broker_unit_terms"("updated_at");
