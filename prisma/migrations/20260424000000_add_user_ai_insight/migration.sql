-- Proactive AI insight: one LLM-generated card per budget, refreshed on demand.
CREATE TABLE IF NOT EXISTS "UserAiInsight" (
  "id"          TEXT NOT NULL,
  "budgetId"    TEXT NOT NULL,
  "headline"    TEXT NOT NULL,
  "body"        TEXT,
  "generatedAt" TIMESTAMP(3) NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserAiInsight_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "UserAiInsight_budgetId_key"
  ON "UserAiInsight"("budgetId");

CREATE INDEX IF NOT EXISTS "UserAiInsight_budgetId_idx"
  ON "UserAiInsight"("budgetId");

ALTER TABLE "UserAiInsight"
  ADD CONSTRAINT "UserAiInsight_budgetId_fkey"
  FOREIGN KEY ("budgetId") REFERENCES "Budget"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
