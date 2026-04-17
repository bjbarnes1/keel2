-- Versioned commitments: future-effective bill edits without rewriting history.

CREATE TABLE "CommitmentVersion" (
    "id" TEXT NOT NULL,
    "commitmentId" TEXT NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "name" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "frequency" TEXT NOT NULL,
    "nextDueDate" TIMESTAMP(3) NOT NULL,
    "categoryId" TEXT NOT NULL,
    "subcategoryId" TEXT,
    "fundedByIncomeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommitmentVersion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CommitmentVersion_commitmentId_effectiveFrom_idx" ON "CommitmentVersion"("commitmentId", "effectiveFrom");

ALTER TABLE "CommitmentVersion" ADD CONSTRAINT "CommitmentVersion_commitmentId_fkey" FOREIGN KEY ("commitmentId") REFERENCES "Commitment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommitmentVersion" ADD CONSTRAINT "CommitmentVersion_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommitmentVersion" ADD CONSTRAINT "CommitmentVersion_subcategoryId_fkey" FOREIGN KEY ("subcategoryId") REFERENCES "Subcategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CommitmentVersion" ADD CONSTRAINT "CommitmentVersion_fundedByIncomeId_fkey" FOREIGN KEY ("fundedByIncomeId") REFERENCES "Income"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "CommitmentVersion" (
  "id",
  "commitmentId",
  "effectiveFrom",
  "effectiveTo",
  "name",
  "amount",
  "frequency",
  "nextDueDate",
  "categoryId",
  "subcategoryId",
  "fundedByIncomeId",
  "createdAt"
)
SELECT
  gen_random_uuid()::text,
  c."id",
  DATE(c."createdAt" AT TIME ZONE 'UTC'),
  NULL,
  c."name",
  c."amount",
  c."frequency",
  c."nextDueDate",
  c."categoryId",
  c."subcategoryId",
  c."fundedByIncomeId",
  CURRENT_TIMESTAMP
FROM "Commitment" c;

ALTER TABLE "CommitmentVersion" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "commitmentversion_crud_member" ON "CommitmentVersion"
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "Commitment" c
      JOIN "BudgetMember" m ON m."budgetId" = c."budgetId"
      WHERE c."id" = "CommitmentVersion"."commitmentId"
        AND m."userId" = auth.uid()::text
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "Commitment" c
      JOIN "BudgetMember" m ON m."budgetId" = c."budgetId"
      WHERE c."id" = "CommitmentVersion"."commitmentId"
        AND m."userId" = auth.uid()::text
    )
  );

