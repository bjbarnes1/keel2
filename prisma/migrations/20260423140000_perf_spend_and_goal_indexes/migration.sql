-- Performance indexes
--
-- (1) SpendTransaction: the spend-attribution rollup groups by commitmentId within
--     a budget over a postedOn range. Without this composite index, Postgres walks
--     the (budgetId, postedOn) index and filters commitmentId in memory. IF NOT EXISTS
--     keeps this idempotent for repeat deploys and local re-runs.
--
-- (2) Goal: there was no explicit index on budgetId. Every goals query scans relation
--     filtered. Added for parity with every other budget-scoped model.

CREATE INDEX IF NOT EXISTS "SpendTransaction_budgetId_commitmentId_postedOn_idx"
  ON "SpendTransaction" ("budgetId", "commitmentId", "postedOn");

CREATE INDEX IF NOT EXISTS "Goal_budgetId_idx"
  ON "Goal" ("budgetId");
