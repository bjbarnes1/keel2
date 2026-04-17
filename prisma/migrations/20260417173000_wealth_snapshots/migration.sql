-- WealthSnapshot: record net worth history points for sparklines.

CREATE TABLE "WealthSnapshot" (
  "id" TEXT NOT NULL,
  "budgetId" TEXT NOT NULL,
  "recordedAt" DATE NOT NULL,
  "totalValue" DECIMAL(65,30) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "WealthSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WealthSnapshot_budgetId_recordedAt_idx" ON "WealthSnapshot"("budgetId", "recordedAt");

ALTER TABLE "WealthSnapshot" ADD CONSTRAINT "WealthSnapshot_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WealthSnapshot" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wealthsnapshot_crud_member" ON "WealthSnapshot"
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "BudgetMember" m
      WHERE m."budgetId" = "WealthSnapshot"."budgetId"
        AND m."userId" = auth.uid()::text
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "BudgetMember" m
      WHERE m."budgetId" = "WealthSnapshot"."budgetId"
        AND m."userId" = auth.uid()::text
    )
  );

