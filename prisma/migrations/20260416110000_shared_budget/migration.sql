-- Create Budget and BudgetMember for shared household access.
CREATE TABLE IF NOT EXISTS "Budget" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "bankBalance" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "balanceAsOf" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Budget_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "BudgetMember" (
  "id" TEXT NOT NULL,
  "budgetId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'owner',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BudgetMember_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "BudgetMember_budgetId_userId_key" ON "BudgetMember"("budgetId", "userId");

ALTER TABLE "BudgetMember"
  ADD CONSTRAINT "BudgetMember_budgetId_fkey"
  FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BudgetMember"
  ADD CONSTRAINT "BudgetMember_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add budgetId columns to existing tables.
ALTER TABLE "Income" ADD COLUMN IF NOT EXISTS "budgetId" TEXT;
ALTER TABLE "Commitment" ADD COLUMN IF NOT EXISTS "budgetId" TEXT;
ALTER TABLE "Goal" ADD COLUMN IF NOT EXISTS "budgetId" TEXT;

-- Backfill: create one budget per user and move their data to that budget.
-- NOTE: This assumes existing schema has User.bankBalance and User.balanceAsOf.
DO $$
DECLARE
  rec RECORD;
  budget_id TEXT;
BEGIN
  FOR rec IN SELECT "id", "name", "bankBalance", "balanceAsOf" FROM "User" LOOP
    budget_id := CONCAT('budget_', rec."id");

    INSERT INTO "Budget" ("id", "name", "bankBalance", "balanceAsOf", "createdAt", "updatedAt")
    VALUES (
      budget_id,
      COALESCE(rec."name", 'Household'),
      rec."bankBalance",
      rec."balanceAsOf",
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    )
    ON CONFLICT ("id") DO NOTHING;

    INSERT INTO "BudgetMember" ("id", "budgetId", "userId", "role", "createdAt")
    VALUES (
      CONCAT('member_', rec."id"),
      budget_id,
      rec."id",
      'owner',
      CURRENT_TIMESTAMP
    )
    ON CONFLICT ("budgetId","userId") DO NOTHING;

    UPDATE "Income" SET "budgetId" = budget_id WHERE "userId" = rec."id" AND "budgetId" IS NULL;
    UPDATE "Commitment" SET "budgetId" = budget_id WHERE "userId" = rec."id" AND "budgetId" IS NULL;
    UPDATE "Goal" SET "budgetId" = budget_id WHERE "userId" = rec."id" AND "budgetId" IS NULL;
  END LOOP;
END $$;

-- Make budgetId required.
ALTER TABLE "Income" ALTER COLUMN "budgetId" SET NOT NULL;
ALTER TABLE "Commitment" ALTER COLUMN "budgetId" SET NOT NULL;
ALTER TABLE "Goal" ALTER COLUMN "budgetId" SET NOT NULL;

-- Replace foreign keys: drop userId relations and add budget relations.
ALTER TABLE "Income" DROP CONSTRAINT IF EXISTS "Income_userId_fkey";
ALTER TABLE "Commitment" DROP CONSTRAINT IF EXISTS "Commitment_userId_fkey";
ALTER TABLE "Goal" DROP CONSTRAINT IF EXISTS "Goal_userId_fkey";

ALTER TABLE "Income"
  ADD CONSTRAINT "Income_budgetId_fkey"
  FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Commitment"
  ADD CONSTRAINT "Commitment_budgetId_fkey"
  FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Goal"
  ADD CONSTRAINT "Goal_budgetId_fkey"
  FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Drop User-owned budget fields and per-table userId columns.
ALTER TABLE "Income" DROP COLUMN IF EXISTS "userId";
ALTER TABLE "Commitment" DROP COLUMN IF EXISTS "userId";
ALTER TABLE "Goal" DROP COLUMN IF EXISTS "userId";

ALTER TABLE "User" DROP COLUMN IF EXISTS "bankBalance";
ALTER TABLE "User" DROP COLUMN IF EXISTS "balanceAsOf";

