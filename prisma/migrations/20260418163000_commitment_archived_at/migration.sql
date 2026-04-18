-- Soft-delete support for commitments (archive instead of hard delete)

ALTER TABLE "Commitment"
ADD COLUMN "archivedAt" TIMESTAMP(3);

CREATE INDEX "Commitment_budgetId_archivedAt_idx" ON "Commitment"("budgetId", "archivedAt");
