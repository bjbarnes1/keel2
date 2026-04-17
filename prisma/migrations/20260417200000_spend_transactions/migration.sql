-- Spend tracking: bank-style accounts, imported transactions, reconciliation tags.

CREATE TABLE "SpendAccount" (
    "id" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'AUD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpendAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SpendImportBatch" (
    "id" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "filename" TEXT,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpendImportBatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SpendTransaction" (
    "id" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "importBatchId" TEXT,
    "postedOn" DATE NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "memo" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "categoryId" TEXT,
    "subcategoryId" TEXT,
    "commitmentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpendTransaction_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SpendAccount_budgetId_idx" ON "SpendAccount"("budgetId");

CREATE INDEX "SpendImportBatch_budgetId_idx" ON "SpendImportBatch"("budgetId");
CREATE INDEX "SpendImportBatch_accountId_idx" ON "SpendImportBatch"("accountId");

CREATE INDEX "SpendTransaction_budgetId_postedOn_idx" ON "SpendTransaction"("budgetId", "postedOn");
CREATE INDEX "SpendTransaction_accountId_postedOn_idx" ON "SpendTransaction"("accountId", "postedOn");

CREATE UNIQUE INDEX "SpendTransaction_budgetId_dedupeKey_key" ON "SpendTransaction"("budgetId", "dedupeKey");

ALTER TABLE "SpendAccount" ADD CONSTRAINT "SpendAccount_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SpendImportBatch" ADD CONSTRAINT "SpendImportBatch_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SpendImportBatch" ADD CONSTRAINT "SpendImportBatch_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "SpendAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SpendTransaction" ADD CONSTRAINT "SpendTransaction_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SpendTransaction" ADD CONSTRAINT "SpendTransaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "SpendAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SpendTransaction" ADD CONSTRAINT "SpendTransaction_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "SpendImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SpendTransaction" ADD CONSTRAINT "SpendTransaction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SpendTransaction" ADD CONSTRAINT "SpendTransaction_subcategoryId_fkey" FOREIGN KEY ("subcategoryId") REFERENCES "Subcategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SpendTransaction" ADD CONSTRAINT "SpendTransaction_commitmentId_fkey" FOREIGN KEY ("commitmentId") REFERENCES "Commitment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Row Level Security (Supabase)
ALTER TABLE "SpendAccount" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SpendImportBatch" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SpendTransaction" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "spendaccount_crud_member" ON "SpendAccount"
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "BudgetMember" m
      WHERE m."budgetId" = "SpendAccount"."budgetId"
        AND m."userId" = auth.uid()::text
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "BudgetMember" m
      WHERE m."budgetId" = "SpendAccount"."budgetId"
        AND m."userId" = auth.uid()::text
    )
  );

CREATE POLICY "spendimportbatch_crud_member" ON "SpendImportBatch"
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "BudgetMember" m
      WHERE m."budgetId" = "SpendImportBatch"."budgetId"
        AND m."userId" = auth.uid()::text
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "BudgetMember" m
      WHERE m."budgetId" = "SpendImportBatch"."budgetId"
        AND m."userId" = auth.uid()::text
    )
  );

CREATE POLICY "spendtransaction_crud_member" ON "SpendTransaction"
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "BudgetMember" m
      WHERE m."budgetId" = "SpendTransaction"."budgetId"
        AND m."userId" = auth.uid()::text
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "BudgetMember" m
      WHERE m."budgetId" = "SpendTransaction"."budgetId"
        AND m."userId" = auth.uid()::text
    )
  );
