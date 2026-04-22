-- Enable Row Level Security on tables that were missing coverage.
--
-- Four tables were never included in any prior RLS migration:
--   CommitmentSkip, GoalSkip, AiRateLimit, User
--
-- Four tables (Category, Subcategory, WealthAccount, WealthHolding) are defined
-- in 20260416130000_budget_rls but may not have been applied to all environments.
-- This migration is idempotent: ENABLE ROW LEVEL SECURITY is a no-op if already
-- enabled, and DROP POLICY IF EXISTS guards against duplicate policy errors.
--
-- Note: the app connects via the `postgres` superrole (Prisma + pgbouncer) which
-- bypasses RLS at runtime. These policies protect PostgREST / Supabase Data API
-- and any future non-superuser service roles.

-- ─── Category ────────────────────────────────────────────────────────────────

ALTER TABLE "Category" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "category_crud_member" ON "Category";
CREATE POLICY "category_crud_member" ON "Category"
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "BudgetMember" m
      WHERE m."budgetId" = "Category"."budgetId"
        AND m."userId" = auth.uid()::text
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "BudgetMember" m
      WHERE m."budgetId" = "Category"."budgetId"
        AND m."userId" = auth.uid()::text
    )
  );

-- ─── Subcategory ─────────────────────────────────────────────────────────────

ALTER TABLE "Subcategory" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "subcategory_crud_member" ON "Subcategory";
CREATE POLICY "subcategory_crud_member" ON "Subcategory"
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM "Category" c
      JOIN "BudgetMember" m ON m."budgetId" = c."budgetId"
      WHERE c."id" = "Subcategory"."categoryId"
        AND m."userId" = auth.uid()::text
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM "Category" c
      JOIN "BudgetMember" m ON m."budgetId" = c."budgetId"
      WHERE c."id" = "Subcategory"."categoryId"
        AND m."userId" = auth.uid()::text
    )
  );

-- ─── WealthAccount ───────────────────────────────────────────────────────────

ALTER TABLE "WealthAccount" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wealthaccount_crud_member" ON "WealthAccount";
CREATE POLICY "wealthaccount_crud_member" ON "WealthAccount"
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "BudgetMember" m
      WHERE m."budgetId" = "WealthAccount"."budgetId"
        AND m."userId" = auth.uid()::text
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "BudgetMember" m
      WHERE m."budgetId" = "WealthAccount"."budgetId"
        AND m."userId" = auth.uid()::text
    )
  );

-- ─── WealthHolding ───────────────────────────────────────────────────────────

ALTER TABLE "WealthHolding" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wealthholding_crud_member" ON "WealthHolding";
CREATE POLICY "wealthholding_crud_member" ON "WealthHolding"
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "BudgetMember" m
      WHERE m."budgetId" = "WealthHolding"."budgetId"
        AND m."userId" = auth.uid()::text
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "BudgetMember" m
      WHERE m."budgetId" = "WealthHolding"."budgetId"
        AND m."userId" = auth.uid()::text
    )
  );

-- ─── CommitmentSkip ──────────────────────────────────────────────────────────

ALTER TABLE "CommitmentSkip" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "commitmentskip_crud_member" ON "CommitmentSkip";
CREATE POLICY "commitmentskip_crud_member" ON "CommitmentSkip"
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "BudgetMember" m
      WHERE m."budgetId" = "CommitmentSkip"."budgetId"
        AND m."userId" = auth.uid()::text
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "BudgetMember" m
      WHERE m."budgetId" = "CommitmentSkip"."budgetId"
        AND m."userId" = auth.uid()::text
    )
  );

-- ─── GoalSkip ────────────────────────────────────────────────────────────────

ALTER TABLE "GoalSkip" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "goalskip_crud_member" ON "GoalSkip";
CREATE POLICY "goalskip_crud_member" ON "GoalSkip"
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "BudgetMember" m
      WHERE m."budgetId" = "GoalSkip"."budgetId"
        AND m."userId" = auth.uid()::text
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "BudgetMember" m
      WHERE m."budgetId" = "GoalSkip"."budgetId"
        AND m."userId" = auth.uid()::text
    )
  );

-- ─── AiRateLimit ─────────────────────────────────────────────────────────────
-- userId is the PK; each row belongs to exactly one user.

ALTER TABLE "AiRateLimit" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "airatelimit_self" ON "AiRateLimit";
CREATE POLICY "airatelimit_self" ON "AiRateLimit"
  FOR ALL
  TO authenticated
  USING ("userId" = auth.uid()::text)
  WITH CHECK ("userId" = auth.uid()::text);

-- ─── User ────────────────────────────────────────────────────────────────────
-- App-side mirror of auth.users. Users can read and update their own row only.
-- Inserts are performed server-side (superrole) on first login; no INSERT policy
-- is needed here because the superrole bypasses RLS.

ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_select_self" ON "User";
CREATE POLICY "user_select_self" ON "User"
  FOR SELECT
  TO authenticated
  USING ("id" = auth.uid()::text);

DROP POLICY IF EXISTS "user_update_self" ON "User";
CREATE POLICY "user_update_self" ON "User"
  FOR UPDATE
  TO authenticated
  USING ("id" = auth.uid()::text)
  WITH CHECK ("id" = auth.uid()::text);
