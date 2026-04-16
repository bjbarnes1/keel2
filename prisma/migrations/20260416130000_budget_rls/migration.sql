-- Enable Row Level Security (RLS) for shared budget tables.
-- Note: If your app connects to Postgres using the Supabase `postgres` role,
-- that role bypasses RLS. These policies primarily protect access via PostgREST
-- / Supabase Data API and any non-bypass roles.

ALTER TABLE "Budget" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BudgetMember" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BudgetInvite" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Income" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Commitment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Goal" ENABLE ROW LEVEL SECURITY;

-- Helper: a user can access a budget if they're a member.
-- We inline this pattern in each policy to avoid requiring SECURITY DEFINER functions.

-- Budget: members can read; only owners can update.
CREATE POLICY "budget_select_member" ON "Budget"
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "BudgetMember" m
      WHERE m."budgetId" = "Budget"."id"
        AND m."userId" = auth.uid()::text
    )
  );

CREATE POLICY "budget_update_owner" ON "Budget"
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "BudgetMember" m
      WHERE m."budgetId" = "Budget"."id"
        AND m."userId" = auth.uid()::text
        AND m."role" = 'owner'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "BudgetMember" m
      WHERE m."budgetId" = "Budget"."id"
        AND m."userId" = auth.uid()::text
        AND m."role" = 'owner'
    )
  );

-- BudgetMember: users can see their own memberships; owners can manage members.
CREATE POLICY "budgetmember_select_self" ON "BudgetMember"
  FOR SELECT
  TO authenticated
  USING (
    "userId" = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM "BudgetMember" m
      WHERE m."budgetId" = "BudgetMember"."budgetId"
        AND m."userId" = auth.uid()::text
        AND m."role" = 'owner'
    )
  );

CREATE POLICY "budgetmember_insert_owner" ON "BudgetMember"
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "BudgetMember" m
      WHERE m."budgetId" = "BudgetMember"."budgetId"
        AND m."userId" = auth.uid()::text
        AND m."role" = 'owner'
    )
  );

CREATE POLICY "budgetmember_delete_owner" ON "BudgetMember"
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "BudgetMember" m
      WHERE m."budgetId" = "BudgetMember"."budgetId"
        AND m."userId" = auth.uid()::text
        AND m."role" = 'owner'
    )
  );

-- BudgetInvite: members can read; owners can create; owners can mark accepted.
CREATE POLICY "budgetinvite_select_member" ON "BudgetInvite"
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "BudgetMember" m
      WHERE m."budgetId" = "BudgetInvite"."budgetId"
        AND m."userId" = auth.uid()::text
    )
  );

CREATE POLICY "budgetinvite_insert_owner" ON "BudgetInvite"
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "BudgetMember" m
      WHERE m."budgetId" = "BudgetInvite"."budgetId"
        AND m."userId" = auth.uid()::text
        AND m."role" = 'owner'
    )
  );

CREATE POLICY "budgetinvite_update_owner" ON "BudgetInvite"
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "BudgetMember" m
      WHERE m."budgetId" = "BudgetInvite"."budgetId"
        AND m."userId" = auth.uid()::text
        AND m."role" = 'owner'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "BudgetMember" m
      WHERE m."budgetId" = "BudgetInvite"."budgetId"
        AND m."userId" = auth.uid()::text
        AND m."role" = 'owner'
    )
  );

-- Budget-scoped finance tables: members can CRUD within their budgets.
CREATE POLICY "income_crud_member" ON "Income"
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "BudgetMember" m
      WHERE m."budgetId" = "Income"."budgetId"
        AND m."userId" = auth.uid()::text
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "BudgetMember" m
      WHERE m."budgetId" = "Income"."budgetId"
        AND m."userId" = auth.uid()::text
    )
  );

CREATE POLICY "commitment_crud_member" ON "Commitment"
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "BudgetMember" m
      WHERE m."budgetId" = "Commitment"."budgetId"
        AND m."userId" = auth.uid()::text
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "BudgetMember" m
      WHERE m."budgetId" = "Commitment"."budgetId"
        AND m."userId" = auth.uid()::text
    )
  );

CREATE POLICY "goal_crud_member" ON "Goal"
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "BudgetMember" m
      WHERE m."budgetId" = "Goal"."budgetId"
        AND m."userId" = auth.uid()::text
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "BudgetMember" m
      WHERE m."budgetId" = "Goal"."budgetId"
        AND m."userId" = auth.uid()::text
    )
  );

