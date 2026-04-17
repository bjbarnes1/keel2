-- Wealth tracking (manual holdings)
CREATE TABLE "WealthAccount" (
  "id" TEXT NOT NULL,
  "budgetId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'OTHER',
  "currency" TEXT NOT NULL DEFAULT 'AUD',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WealthAccount_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WealthAccount_budgetId_idx" ON "WealthAccount"("budgetId");

ALTER TABLE "WealthAccount"
  ADD CONSTRAINT "WealthAccount_budgetId_fkey"
  FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "WealthHolding" (
  "id" TEXT NOT NULL,
  "budgetId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "assetType" TEXT NOT NULL,
  "symbol" TEXT,
  "name" TEXT NOT NULL,
  "quantity" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "unitPrice" DECIMAL(65,30),
  "valueOverride" DECIMAL(65,30),
  "asOf" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WealthHolding_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WealthHolding_budgetId_idx" ON "WealthHolding"("budgetId");
CREATE INDEX "WealthHolding_accountId_idx" ON "WealthHolding"("accountId");

ALTER TABLE "WealthHolding"
  ADD CONSTRAINT "WealthHolding_budgetId_fkey"
  FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WealthHolding"
  ADD CONSTRAINT "WealthHolding_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "WealthAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

