-- Add BudgetInvite for sharing flows.
CREATE TABLE "BudgetInvite" (
  "id" TEXT NOT NULL,
  "budgetId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "invitedByUserId" TEXT NOT NULL,
  "acceptedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BudgetInvite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BudgetInvite_token_key" ON "BudgetInvite"("token");

CREATE INDEX "BudgetInvite_budgetId_idx" ON "BudgetInvite"("budgetId");

ALTER TABLE "BudgetInvite"
  ADD CONSTRAINT "BudgetInvite_budgetId_fkey"
  FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BudgetInvite"
  ADD CONSTRAINT "BudgetInvite_invitedByUserId_fkey"
  FOREIGN KEY ("invitedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

