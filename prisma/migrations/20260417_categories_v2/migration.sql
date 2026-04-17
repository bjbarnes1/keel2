-- Categories V2: budget-scoped categories + subcategories

CREATE TABLE "Category" (
  "id" TEXT NOT NULL,
  "budgetId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Category_budgetId_name_key" ON "Category"("budgetId","name");
CREATE INDEX "Category_budgetId_idx" ON "Category"("budgetId");

ALTER TABLE "Category"
  ADD CONSTRAINT "Category_budgetId_fkey"
  FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "Subcategory" (
  "id" TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Subcategory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Subcategory_categoryId_name_key" ON "Subcategory"("categoryId","name");
CREATE INDEX "Subcategory_categoryId_idx" ON "Subcategory"("categoryId");

ALTER TABLE "Subcategory"
  ADD CONSTRAINT "Subcategory_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add new refs to Commitment
ALTER TABLE "Commitment" ADD COLUMN "categoryId" TEXT;
ALTER TABLE "Commitment" ADD COLUMN "subcategoryId" TEXT;

-- Backfill categories per budget using existing Commitment.category strings.
-- First, create default categories per budget from existing commitments.
INSERT INTO "Category" ("id","budgetId","name","sortOrder","createdAt","updatedAt")
SELECT
  CONCAT('cat_', c."budgetId", '_', REPLACE(LOWER(COALESCE(c."category",'Other')), ' ', '_')) AS id,
  c."budgetId",
  COALESCE(c."category",'Other') AS name,
  0,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Commitment" c
GROUP BY c."budgetId", COALESCE(c."category",'Other');

-- Set Commitment.categoryId to the generated Category id.
UPDATE "Commitment" c
SET "categoryId" = CONCAT('cat_', c."budgetId", '_', REPLACE(LOWER(COALESCE(c."category",'Other')), ' ', '_'))
WHERE c."categoryId" IS NULL;

-- Make categoryId required and add FKs.
ALTER TABLE "Commitment" ALTER COLUMN "categoryId" SET NOT NULL;

ALTER TABLE "Commitment"
  ADD CONSTRAINT "Commitment_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Commitment"
  ADD CONSTRAINT "Commitment_subcategoryId_fkey"
  FOREIGN KEY ("subcategoryId") REFERENCES "Subcategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Commitment_categoryId_idx" ON "Commitment"("categoryId");
CREATE INDEX "Commitment_subcategoryId_idx" ON "Commitment"("subcategoryId");

-- Drop old string category column
ALTER TABLE "Commitment" DROP COLUMN "category";

