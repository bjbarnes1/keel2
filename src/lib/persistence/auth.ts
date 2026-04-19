import { getPrismaClient } from "@/lib/prisma";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function getAuthedUser() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) throw new Error(error.message);
  if (!data.user) throw new Error("Not authenticated.");
  return data.user;
}

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
