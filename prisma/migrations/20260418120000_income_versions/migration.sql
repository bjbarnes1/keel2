-- Versioned income: future-effective changes without rewriting history.

CREATE TABLE "IncomeVersion" (
    "id" TEXT NOT NULL,
    "incomeId" TEXT NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "name" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "frequency" TEXT NOT NULL,
    "nextPayDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IncomeVersion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "IncomeVersion_incomeId_effectiveFrom_idx" ON "IncomeVersion"("incomeId", "effectiveFrom");

ALTER TABLE "IncomeVersion" ADD CONSTRAINT "IncomeVersion_incomeId_fkey" FOREIGN KEY ("incomeId") REFERENCES "Income"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "IncomeVersion" ("id", "incomeId", "effectiveFrom", "effectiveTo", "name", "amount", "frequency", "nextPayDate", "createdAt")
SELECT
    gen_random_uuid()::text,
    i."id",
    DATE(i."createdAt" AT TIME ZONE 'UTC'),
    NULL,
    i."name",
    i."amount",
    i."frequency",
    i."nextPayDate",
    CURRENT_TIMESTAMP
FROM "Income" i;

ALTER TABLE "IncomeVersion" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "incomeversion_crud_member" ON "IncomeVersion"
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "Income" i
      JOIN "BudgetMember" m ON m."budgetId" = i."budgetId"
      WHERE i."id" = "IncomeVersion"."incomeId"
        AND m."userId" = auth.uid()::text
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "Income" i
      JOIN "BudgetMember" m ON m."budgetId" = i."budgetId"
      WHERE i."id" = "IncomeVersion"."incomeId"
        AND m."userId" = auth.uid()::text
    )
  );
