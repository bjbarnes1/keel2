-- Plan 11 — Layer B storage for AI Context Architecture.
--
-- One row per budget; `patterns` is JSON validated against `learnedPatternsSchema`
-- on read (never trusted raw). Refreshed by a deterministic weekly analyser — no LLM
-- calls happen against this table.

CREATE TABLE "UserLearnedPatterns" (
  "id"                   TEXT        NOT NULL PRIMARY KEY,
  "budgetId"             TEXT        NOT NULL UNIQUE,
  "lastAnalyzedAt"       TIMESTAMP(3) NOT NULL,
  "analysisCoveringFrom" DATE         NOT NULL,
  "analysisCoveringTo"   DATE         NOT NULL,
  "patterns"             JSONB        NOT NULL,
  "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"            TIMESTAMP(3) NOT NULL,

  CONSTRAINT "UserLearnedPatterns_budgetId_fkey"
    FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "UserLearnedPatterns_budgetId_idx" ON "UserLearnedPatterns"("budgetId");

-- ─── Row Level Security ──────────────────────────────────────────────────────
-- App code connects as the superrole (bypasses RLS). These policies defend the
-- table if/when a non-superuser role (PostgREST, direct Data API) ever queries.

ALTER TABLE "UserLearnedPatterns" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_learned_patterns_crud_member" ON "UserLearnedPatterns";
CREATE POLICY "user_learned_patterns_crud_member" ON "UserLearnedPatterns"
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "BudgetMember" m
      WHERE m."budgetId" = "UserLearnedPatterns"."budgetId"
        AND m."userId" = auth.uid()::text
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "BudgetMember" m
      WHERE m."budgetId" = "UserLearnedPatterns"."budgetId"
        AND m."userId" = auth.uid()::text
    )
  );
