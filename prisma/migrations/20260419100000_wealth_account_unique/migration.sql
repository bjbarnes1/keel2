-- Ensure at most one default account per budget (supports upsert in application code).
CREATE UNIQUE INDEX "WealthAccount_budgetId_name_key" ON "WealthAccount"("budgetId", "name");
