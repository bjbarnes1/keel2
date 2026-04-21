/**
 * Authentication and budget tenancy helpers.
 *
 * `getAuthedUser` is the choke point for Server Actions / persistence: it reads the
 * Supabase JWT via `createSupabaseServerClient()` and throws if absent.
 *
 * `getBudgetContext` resolves the caller’s active `Budget` row (creating a household
 * on first login) and verifies membership — all multi-tenant queries should hang off
 * the returned `budget.id`.
 *
 * @module lib/persistence/auth
 */

import { getPrismaClient } from "@/lib/prisma";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** @throws If Supabase returns an error or there is no authenticated user. */
export async function getAuthedUser() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) throw new Error(error.message);
  if (!data.user) throw new Error("Not authenticated.");
  return data.user;
}

/**
 * Ensures a `User` row exists and returns their first (or newly-created) budget.
 *
 * Side effects: `upsert` on `User`, possible `budget.create` with owner membership.
 */
export async function getOrCreateActiveBudget(input: {
  userId: string;
  email: string;
  name: string;
}) {
  const prisma = getPrismaClient();

  await prisma.user.upsert({
    where: { id: input.userId },
    update: { email: input.email, name: input.name },
    create: { id: input.userId, email: input.email, name: input.name },
  });

  const membership = await prisma.budgetMember.findFirst({
    where: { userId: input.userId },
    include: { budget: true },
    orderBy: { createdAt: "asc" },
  });

  if (membership) return membership.budget;

  const budget = await prisma.budget.create({
    data: {
      name: input.name ? `${input.name}'s Household` : "Household",
      bankBalance: 0,
      balanceAsOf: null,
      members: { create: { userId: input.userId, role: "owner" } },
    },
  });

  return budget;
}

/**
 * Full request context for persistence functions: authenticated user + budget + membership.
 *
 * @throws If the user record exists but has no `BudgetMember` row for the resolved budget
 *         (shouldn’t happen after `getOrCreateActiveBudget`, but guarded anyway).
 */
export async function getBudgetContext() {
  const prisma = getPrismaClient();
  const authedUser = await getAuthedUser();
  const budget = await getOrCreateActiveBudget({
    userId: authedUser.id,
    email: authedUser.email ?? "",
    name: (authedUser.user_metadata?.["name"] as string | undefined) ?? "",
  });

  const membership = await prisma.budgetMember.findFirst({
    where: { userId: authedUser.id, budgetId: budget.id },
  });

  if (!membership) throw new Error("You are not a member of this budget.");
  return { authedUser, budget, membership };
}
