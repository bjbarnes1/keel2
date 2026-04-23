-- CreateEnum
CREATE TYPE "IncomeSkipStrategy" AS ENUM ('STANDALONE');

-- CreateTable
CREATE TABLE "IncomeSkip" (
    "id" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "incomeId" TEXT NOT NULL,
    "originalDate" DATE NOT NULL,
    "strategy" "IncomeSkipStrategy" NOT NULL DEFAULT 'STANDALONE',
    "notes" TEXT,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT NOT NULL,

    CONSTRAINT "IncomeSkip_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IncomeSkip_incomeId_originalDate_key" ON "IncomeSkip"("incomeId", "originalDate");

-- CreateIndex
CREATE INDEX "IncomeSkip_budgetId_revokedAt_idx" ON "IncomeSkip"("budgetId", "revokedAt");

-- CreateIndex
CREATE INDEX "IncomeSkip_budgetId_originalDate_idx" ON "IncomeSkip"("budgetId", "originalDate");

-- AddForeignKey
ALTER TABLE "IncomeSkip" ADD CONSTRAINT "IncomeSkip_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomeSkip" ADD CONSTRAINT "IncomeSkip_incomeId_fkey" FOREIGN KEY ("incomeId") REFERENCES "Income"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS (match CommitmentSkip / GoalSkip member policies)
ALTER TABLE "IncomeSkip" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "incomeskip_crud_member" ON "IncomeSkip";
CREATE POLICY "incomeskip_crud_member" ON "IncomeSkip"
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "BudgetMember" m
      WHERE m."budgetId" = "IncomeSkip"."budgetId"
        AND m."userId" = auth.uid()::text
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "BudgetMember" m
      WHERE m."budgetId" = "IncomeSkip"."budgetId"
        AND m."userId" = auth.uid()::text
    )
  );
