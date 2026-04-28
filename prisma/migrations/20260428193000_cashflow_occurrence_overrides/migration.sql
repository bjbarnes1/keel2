-- Persisted per-occurrence payment-date moves for timeline scenarios.
-- Keeps recurrence anchors unchanged while allowing individual occurrences to shift.

DO $$
BEGIN
  CREATE TYPE "OccurrenceOverrideKind" AS ENUM ('INCOME', 'COMMITMENT');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "CashflowOccurrenceOverride" (
  "id" TEXT NOT NULL,
  "budgetId" TEXT NOT NULL,
  "kind" "OccurrenceOverrideKind" NOT NULL,
  "sourceId" TEXT NOT NULL,
  "originalDate" DATE NOT NULL,
  "scheduledDate" DATE NOT NULL,
  "scenarioBatchId" TEXT,
  "notes" TEXT,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdByUserId" TEXT NOT NULL,

  CONSTRAINT "CashflowOccurrenceOverride_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CashflowOccurrenceOverride_budgetId_kind_sourceId_originalDate_key"
  ON "CashflowOccurrenceOverride"("budgetId", "kind", "sourceId", "originalDate");

CREATE INDEX IF NOT EXISTS "CashflowOccurrenceOverride_budgetId_revokedAt_idx"
  ON "CashflowOccurrenceOverride"("budgetId", "revokedAt");

CREATE INDEX IF NOT EXISTS "CashflowOccurrenceOverride_budgetId_scheduledDate_idx"
  ON "CashflowOccurrenceOverride"("budgetId", "scheduledDate");

CREATE INDEX IF NOT EXISTS "CashflowOccurrenceOverride_budgetId_kind_sourceId_idx"
  ON "CashflowOccurrenceOverride"("budgetId", "kind", "sourceId");

DO $$
BEGIN
  ALTER TABLE "CashflowOccurrenceOverride"
    ADD CONSTRAINT "CashflowOccurrenceOverride_budgetId_fkey"
    FOREIGN KEY ("budgetId") REFERENCES "Budget"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- RLS for Supabase Data API access (Prisma superrole bypasses at runtime).
ALTER TABLE "CashflowOccurrenceOverride" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cashflowoccurrenceoverride_crud_member" ON "CashflowOccurrenceOverride";
CREATE POLICY "cashflowoccurrenceoverride_crud_member" ON "CashflowOccurrenceOverride"
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "BudgetMember" m
      WHERE m."budgetId" = "CashflowOccurrenceOverride"."budgetId"
        AND m."userId" = auth.uid()::text
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "BudgetMember" m
      WHERE m."budgetId" = "CashflowOccurrenceOverride"."budgetId"
        AND m."userId" = auth.uid()::text
    )
  );
