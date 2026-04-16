-- Add primary income flag
ALTER TABLE "Income" ADD COLUMN "isPrimary" BOOLEAN NOT NULL DEFAULT false;

-- Add income allocation columns
ALTER TABLE "Commitment" ADD COLUMN "fundedByIncomeId" TEXT;
ALTER TABLE "Goal" ADD COLUMN "fundedByIncomeId" TEXT;

-- Mark one primary income per user (oldest by createdAt)
WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (PARTITION BY "userId" ORDER BY "createdAt" ASC, "id" ASC) AS rn
  FROM "Income"
)
UPDATE "Income"
SET "isPrimary" = true
FROM ranked
WHERE "Income"."id" = ranked."id" AND ranked.rn = 1;

-- Backfill existing commitments/goals to the primary income for their user
UPDATE "Commitment" c
SET "fundedByIncomeId" = i."id"
FROM "Income" i
WHERE
  c."fundedByIncomeId" IS NULL
  AND i."userId" = c."userId"
  AND i."isPrimary" = true;

UPDATE "Goal" g
SET "fundedByIncomeId" = i."id"
FROM "Income" i
WHERE
  g."fundedByIncomeId" IS NULL
  AND i."userId" = g."userId"
  AND i."isPrimary" = true;

-- Add foreign keys
ALTER TABLE "Commitment"
ADD CONSTRAINT "Commitment_fundedByIncomeId_fkey"
FOREIGN KEY ("fundedByIncomeId") REFERENCES "Income"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Goal"
ADD CONSTRAINT "Goal_fundedByIncomeId_fkey"
FOREIGN KEY ("fundedByIncomeId") REFERENCES "Income"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Helpful indexes for allocation queries
CREATE INDEX "Commitment_fundedByIncomeId_idx" ON "Commitment"("fundedByIncomeId");
CREATE INDEX "Goal_fundedByIncomeId_idx" ON "Goal"("fundedByIncomeId");
