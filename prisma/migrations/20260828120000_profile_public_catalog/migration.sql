ALTER TABLE "users"
  ADD COLUMN "full_name" VARCHAR(160),
  ADD COLUMN "phone" VARCHAR(16),
  ADD COLUMN "preferred_language" "PreferredLanguage",
  ADD COLUMN "preferred_currency" CHAR(3);

ALTER TABLE "organizations"
  ADD COLUMN "about" TEXT,
  ADD COLUMN "logo_url" VARCHAR(1000);
