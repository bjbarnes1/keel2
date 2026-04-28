-- Locked build: household config, category pool hints, Up + medical + rebates + rules.

ALTER TABLE "Budget" ADD COLUMN IF NOT EXISTS "householdConfig" JSONB;

ALTER TABLE "Category" ADD COLUMN IF NOT EXISTS "poolKind" TEXT;
ALTER TABLE "Category" ADD COLUMN IF NOT EXISTS "isSinkingFund" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "SpendAccount" ADD COLUMN IF NOT EXISTS "upAccountId" TEXT;
ALTER TABLE "SpendAccount" ADD COLUMN IF NOT EXISTS "upLastSyncedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "SpendAccount_budgetId_upAccountId_idx" ON "SpendAccount"("budgetId", "upAccountId");

CREATE TABLE "MedicalSubItem" (
    "id" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "expectedTotal" DECIMAL(65,30),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MedicalSubItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MedicalSubItem_budgetId_idx" ON "MedicalSubItem"("budgetId");

ALTER TABLE "MedicalSubItem" ADD CONSTRAINT "MedicalSubItem_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "SpendCategorisationRule" (
    "id" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "matchKind" TEXT NOT NULL DEFAULT 'MEMO_CONTAINS',
    "pattern" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "subcategoryId" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpendCategorisationRule_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SpendCategorisationRule_budgetId_priority_idx" ON "SpendCategorisationRule"("budgetId", "priority");

ALTER TABLE "SpendCategorisationRule" ADD CONSTRAINT "SpendCategorisationRule_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SpendCategorisationRule" ADD CONSTRAINT "SpendCategorisationRule_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SpendCategorisationRule" ADD CONSTRAINT "SpendCategorisationRule_subcategoryId_fkey" FOREIGN KEY ("subcategoryId") REFERENCES "Subcategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "RebateAllocation" (
    "id" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
    "creditId" TEXT,
    "amount" DECIMAL(65,30) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RebateAllocation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RebateAllocation_budgetId_idx" ON "RebateAllocation"("budgetId");
CREATE INDEX "RebateAllocation_expenseId_idx" ON "RebateAllocation"("expenseId");

ALTER TABLE "RebateAllocation" ADD CONSTRAINT "RebateAllocation_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RebateAllocation" ADD CONSTRAINT "RebateAllocation_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "SpendTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RebateAllocation" ADD CONSTRAINT "RebateAllocation_creditId_fkey" FOREIGN KEY ("creditId") REFERENCES "SpendTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SpendTransaction" ADD COLUMN IF NOT EXISTS "medicalSubItemId" TEXT;
ALTER TABLE "SpendTransaction" ADD COLUMN IF NOT EXISTS "externalSource" TEXT;
ALTER TABLE "SpendTransaction" ADD COLUMN IF NOT EXISTS "externalId" TEXT;
ALTER TABLE "SpendTransaction" ADD COLUMN IF NOT EXISTS "rebateState" TEXT;
ALTER TABLE "SpendTransaction" ADD COLUMN IF NOT EXISTS "rebateExpectedAmount" DECIMAL(65,30);
ALTER TABLE "SpendTransaction" ADD COLUMN IF NOT EXISTS "rebateMatchedAmount" DECIMAL(65,30) DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS "SpendTransaction_budgetId_externalSource_externalId_key" ON "SpendTransaction"("budgetId", "externalSource", "externalId");

CREATE INDEX IF NOT EXISTS "SpendTransaction_budgetId_medicalSubItemId_idx" ON "SpendTransaction"("budgetId", "medicalSubItemId");

ALTER TABLE "SpendTransaction" ADD CONSTRAINT "SpendTransaction_medicalSubItemId_fkey" FOREIGN KEY ("medicalSubItemId") REFERENCES "MedicalSubItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
