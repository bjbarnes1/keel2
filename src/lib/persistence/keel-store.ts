import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { unstable_noStore as noStore } from "next/cache";

import {
  buildProjectionTimeline,
  calculateAvailableMoney,
  detectProjectedShortfall,
} from "@/lib/engine/keel";
import { getPrismaClient } from "@/lib/prisma";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  CommitmentCategory,
  CommitmentView,
  GoalView,
  IncomeView,
  ProjectionEventView,
} from "@/lib/types";

type StoredUser = {
  id: string;
  email: string;
  name: string;
  bankBalance: number;
  balanceAsOf: string;
};

type StoredBudget = {
  id: string;
  name: string;
};

type StoredIncome = {
  id: string;
  name: string;
  amount: number;
  frequency: "weekly" | "fortnightly" | "monthly";
  nextPayDate: string;
  isPrimary?: boolean;
};

type StoredCommitment = {
  id: string;
  name: string;
  amount: number;
  frequency: "weekly" | "fortnightly" | "monthly" | "quarterly" | "annual";
  nextDueDate: string;
  category: CommitmentCategory;
  fundedByIncomeId?: string;
};

type StoredGoal = {
  id: string;
  name: string;
  contributionPerPay: number;
  currentBalance: number;
  targetAmount?: number;
  targetDate?: string;
  fundedByIncomeId?: string;
};

type StoredKeelState = {
  user: StoredUser;
  budget: StoredBudget;
  incomes: StoredIncome[];
  primaryIncomeId: string;
  commitments: StoredCommitment[];
  goals: StoredGoal[];
};

export type DashboardSnapshot = {
  userName: string;
  budgetName: string;
  bankBalance: number;
  balanceAsOf: string;
  incomes: IncomeView[];
  primaryIncomeId: string;
  commitments: CommitmentView[];
  goals: GoalView[];
  totalReserved: number;
  totalGoalContributions: number;
  availableMoney: number;
  timeline: ProjectionEventView[];
  alert: string;
};

const demoStorePath = path.join(process.cwd(), "data", "dev-store.json");

function hasConfiguredDatabase() {
  const url = process.env.DATABASE_URL ?? "";
  return Boolean(url) && !url.includes("johndoe:randompassword");
}

function hasSupabaseAuthConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

function isHostedProduction() {
  return process.env.NODE_ENV === "production" && process.env.VERCEL === "1";
}

function formatShortDate(isoDate: string) {
  return new Intl.DateTimeFormat("en-AU", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${isoDate}T00:00:00Z`));
}

async function readDemoStore() {
  const file = await readFile(demoStorePath, "utf8");
  return JSON.parse(file) as StoredKeelState;
}

async function writeDemoStore(state: StoredKeelState) {
  await mkdir(path.dirname(demoStorePath), { recursive: true });
  await writeFile(demoStorePath, JSON.stringify(state, null, 2));
}

async function getAuthedUser() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();

  if (error) {
    throw new Error(error.message);
  }

  if (!data.user) {
    throw new Error("Not authenticated.");
  }

  return data.user;
}

async function getOrCreateActiveBudget(input: { userId: string; email: string; name: string }) {
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

  if (membership) {
    return membership.budget;
  }

  const budget = await prisma.budget.create({
    data: {
      name: input.name ? `${input.name}'s Household` : "Household",
      bankBalance: 0,
      balanceAsOf: null,
      members: {
        create: {
          userId: input.userId,
          role: "owner",
        },
      },
    },
  });

  return budget;
}

async function getBudgetContext() {
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

  if (!membership) {
    throw new Error("You are not a member of this budget.");
  }

  return { authedUser, budget, membership };
}

async function readPrismaState(): Promise<StoredKeelState> {
  const prisma = getPrismaClient();
  const authedUser = await getAuthedUser();
  const budget = await getOrCreateActiveBudget({
    userId: authedUser.id,
    email: authedUser.email ?? "",
    name: (authedUser.user_metadata?.["name"] as string | undefined) ?? "",
  });

  const budgetWithData = await prisma.budget.findFirst({
    where: { id: budget.id },
    include: {
      incomes: { orderBy: { createdAt: "asc" } },
      commitments: { orderBy: { nextDueDate: "asc" } },
      goals: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!budgetWithData) {
    throw new Error("Budget not found.");
  }

  const primaryIncome =
    budgetWithData.incomes.find((income) => income.isPrimary) ??
    budgetWithData.incomes[0];
  const primaryIncomeId = primaryIncome?.id;

  if (!primaryIncomeId) {
    // Bootstrap a placeholder income so the app can render, then user can edit.
    const nextPayDate = new Date();
    nextPayDate.setUTCDate(nextPayDate.getUTCDate() + 14);
    const created = await prisma.income.create({
      data: {
        budgetId: budgetWithData.id,
        name: "Income",
        amount: 0,
        frequency: "fortnightly",
        nextPayDate,
        isPrimary: true,
      },
    });

    budgetWithData.incomes.push(created);
  }

  return {
    user: {
      id: authedUser.id,
      email: authedUser.email ?? "",
      name:
        (authedUser.user_metadata?.["name"] as string | undefined) ??
        authedUser.email ??
        "Keel User",
      bankBalance: Number(budgetWithData.bankBalance),
      balanceAsOf: budgetWithData.balanceAsOf
        ? budgetWithData.balanceAsOf.toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10),
    },
    budget: {
      id: budgetWithData.id,
      name: budgetWithData.name,
    },
    incomes: budgetWithData.incomes.map((income) => ({
      id: income.id,
      name: income.name,
      amount: Number(income.amount),
      frequency: income.frequency as StoredIncome["frequency"],
      nextPayDate: income.nextPayDate.toISOString().slice(0, 10),
      isPrimary: income.isPrimary,
    })),
    primaryIncomeId: primaryIncomeId ?? budgetWithData.incomes[0]!.id,
    commitments: budgetWithData.commitments.map((commitment) => ({
      id: commitment.id,
      name: commitment.name,
      amount: Number(commitment.amount),
      frequency: commitment.frequency as StoredCommitment["frequency"],
      nextDueDate: commitment.nextDueDate.toISOString().slice(0, 10),
      category: (commitment.category ?? "Other") as CommitmentCategory,
      fundedByIncomeId: commitment.fundedByIncomeId ?? undefined,
    })),
    goals: budgetWithData.goals.map((goal) => ({
      id: goal.id,
      name: goal.name,
      contributionPerPay: Number(goal.contributionPerPay),
      currentBalance: Number(goal.currentBalance),
      targetAmount: goal.targetAmount ? Number(goal.targetAmount) : undefined,
      targetDate: goal.targetDate?.toISOString().slice(0, 10),
      fundedByIncomeId: goal.fundedByIncomeId ?? undefined,
    })),
  };
}

async function readState() {
  if (hasConfiguredDatabase()) {
    if (!hasSupabaseAuthConfigured()) {
      // Local DB without auth wiring: fall back to demo store behavior.
      return readDemoStore();
    }
    return readPrismaState();
  }

  return readDemoStore();
}

async function writeState(state: StoredKeelState) {
  if (isHostedProduction()) {
    throw new Error(
      "Persistence requires DATABASE_URL in production deployments. Configure Postgres before using write actions on Vercel.",
    );
  }

  await writeDemoStore(state);
}

function toDashboardSnapshot(state: StoredKeelState): DashboardSnapshot {
  const asOf = new Date(`${state.user.balanceAsOf}T00:00:00Z`);
  const availableMoneyResult = calculateAvailableMoney({
    bankBalance: state.user.bankBalance,
    incomes: state.incomes,
    primaryIncomeId: state.primaryIncomeId,
    commitments: state.commitments,
    goals: state.goals,
    asOf,
  });

  const timelineRaw = buildProjectionTimeline({
    availableMoney: availableMoneyResult.availableMoney,
    asOf,
    horizonDays: 60,
    incomes: state.incomes,
    commitments: state.commitments,
  });

  const shortfall = detectProjectedShortfall(timelineRaw);

  return {
    userName: state.user.name,
    budgetName: state.budget.name,
    bankBalance: state.user.bankBalance,
    balanceAsOf: formatShortDate(state.user.balanceAsOf),
    incomes: state.incomes.map((income) => ({
      ...income,
      nextPayDate: formatShortDate(income.nextPayDate),
    })),
    primaryIncomeId: state.primaryIncomeId,
    commitments: availableMoneyResult.commitmentReserves.map((commitment) => ({
      ...commitment,
      nextDueDate: formatShortDate(commitment.nextDueDate),
      category: (commitment.category ?? "Other") as CommitmentCategory,
    })),
    goals: state.goals.map((goal) => ({
      ...goal,
      targetDate: goal.targetDate ? formatShortDate(goal.targetDate) : undefined,
    })),
    totalReserved: availableMoneyResult.totalReserved,
    totalGoalContributions: availableMoneyResult.totalGoalContributions,
    availableMoney: availableMoneyResult.availableMoney,
    timeline: timelineRaw.map((event) => ({
      ...event,
      date: formatShortDate(event.date),
    })),
    alert: shortfall
      ? `Your available money is projected to go negative around ${formatShortDate(
          shortfall.date,
        )} when ${shortfall.label} hits.`
      : "Your available money stays positive across the next 60 days.",
  };
}

export async function getDashboardSnapshot() {
  noStore();
  const state = await readState();
  return toDashboardSnapshot(state);
}

export async function getCommitmentForEdit(id: string) {
  noStore();
  const state = await readState();
  return state.commitments.find((commitment) => commitment.id === id) ?? null;
}

export async function getIncomeSnapshot() {
  noStore();
  const state = await readState();
  return {
    incomes: state.incomes,
    primaryIncomeId: state.primaryIncomeId,
  };
}

export async function updateBankBalance(amount: number) {
  if (hasConfiguredDatabase()) {
    const prisma = getPrismaClient();
    const authedUser = await getAuthedUser();
    const budget = await getOrCreateActiveBudget({
      userId: authedUser.id,
      email: authedUser.email ?? "",
      name: (authedUser.user_metadata?.["name"] as string | undefined) ?? "",
    });

    await prisma.budget.update({
      where: { id: budget.id },
      data: { bankBalance: amount, balanceAsOf: new Date() },
    });
    return;
  }

  const state = await readState();
  state.user.bankBalance = amount;
  state.user.balanceAsOf = new Date().toISOString().slice(0, 10);
  await writeState(state);
}

export async function createIncome(input: {
  name: string;
  amount: number;
  frequency: StoredIncome["frequency"];
  nextPayDate: string;
  isPrimary?: boolean;
}) {
  if (hasConfiguredDatabase()) {
    const prisma = getPrismaClient();
    const authedUser = await getAuthedUser();
    const budget = await getOrCreateActiveBudget({
      userId: authedUser.id,
      email: authedUser.email ?? "",
      name: (authedUser.user_metadata?.["name"] as string | undefined) ?? "",
    });

    if (input.isPrimary) {
      await prisma.income.updateMany({
        where: { budgetId: budget.id },
        data: { isPrimary: false },
      });
    }

    await prisma.income.create({
      data: {
        budgetId: budget.id,
        name: input.name,
        amount: input.amount,
        frequency: input.frequency,
        nextPayDate: new Date(`${input.nextPayDate}T00:00:00Z`),
        isPrimary: Boolean(input.isPrimary),
      },
    });

    return;
  }

  const state = await readState();
  const incomeId = randomUUID();
  const next = {
    id: incomeId,
    name: input.name,
    amount: input.amount,
    frequency: input.frequency,
    nextPayDate: input.nextPayDate,
    isPrimary: Boolean(input.isPrimary),
  } satisfies StoredIncome;

  state.incomes.push(next);
  if (input.isPrimary || state.incomes.length === 1) {
    state.primaryIncomeId = incomeId;
    state.incomes = state.incomes.map((income) => ({
      ...income,
      isPrimary: income.id === incomeId,
    }));
  }
  await writeState(state);
}

export async function setPrimaryIncome(incomeId: string) {
  if (hasConfiguredDatabase()) {
    const prisma = getPrismaClient();
    const authedUser = await getAuthedUser();
    const budget = await getOrCreateActiveBudget({
      userId: authedUser.id,
      email: authedUser.email ?? "",
      name: (authedUser.user_metadata?.["name"] as string | undefined) ?? "",
    });

    await prisma.income.updateMany({
      where: { budgetId: budget.id },
      data: { isPrimary: false },
    });
    await prisma.income.update({
      where: { id: incomeId },
      data: { isPrimary: true },
    });
    return;
  }

  const state = await readState();
  state.primaryIncomeId = incomeId;
  state.incomes = state.incomes.map((income) => ({
    ...income,
    isPrimary: income.id === incomeId,
  }));

  // Ensure all allocations still point at valid incomes.
  for (const commitment of state.commitments) {
    if (
      commitment.fundedByIncomeId &&
      !state.incomes.some((income) => income.id === commitment.fundedByIncomeId)
    ) {
      commitment.fundedByIncomeId = incomeId;
    }
  }

  for (const goal of state.goals) {
    if (
      goal.fundedByIncomeId &&
      !state.incomes.some((income) => income.id === goal.fundedByIncomeId)
    ) {
      goal.fundedByIncomeId = incomeId;
    }
  }

  await writeState(state);
}

export async function deleteIncome(incomeId: string) {
  if (hasConfiguredDatabase()) {
    const prisma = getPrismaClient();
    const authedUser = await getAuthedUser();
    const budget = await getOrCreateActiveBudget({
      userId: authedUser.id,
      email: authedUser.email ?? "",
      name: (authedUser.user_metadata?.["name"] as string | undefined) ?? "",
    });

    const incomes = await prisma.income.findMany({
      where: { budgetId: budget.id },
      orderBy: { createdAt: "asc" },
    });

    const remaining = incomes.filter((income) => income.id !== incomeId);
    if (remaining.length === 0) {
      throw new Error("You must have at least one income.");
    }

    await prisma.income.delete({ where: { id: incomeId } });

    // If we deleted the primary, promote the oldest remaining.
    const deletedWasPrimary = incomes.some(
      (income) => income.id === incomeId && income.isPrimary,
    );

    if (deletedWasPrimary) {
      await prisma.income.updateMany({
        where: { budgetId: budget.id },
        data: { isPrimary: false },
      });
      await prisma.income.update({
        where: { id: remaining[0]!.id },
        data: { isPrimary: true },
      });
    }

    return;
  }

  const state = await readState();
  state.incomes = state.incomes.filter((income) => income.id !== incomeId);
  if (state.incomes.length === 0) {
    throw new Error("You must have at least one income.");
  }

  if (state.primaryIncomeId === incomeId) {
    state.primaryIncomeId = state.incomes[0]!.id;
  }

  // Reassign any allocations pointing at the deleted income.
  for (const commitment of state.commitments) {
    if (commitment.fundedByIncomeId === incomeId) {
      commitment.fundedByIncomeId = state.primaryIncomeId;
    }
  }
  for (const goal of state.goals) {
    if (goal.fundedByIncomeId === incomeId) {
      goal.fundedByIncomeId = state.primaryIncomeId;
    }
  }

  state.incomes = state.incomes.map((income) => ({
    ...income,
    isPrimary: income.id === state.primaryIncomeId,
  }));

  await writeState(state);
}

export async function getBudgetMembers() {
  noStore();

  if (!hasConfiguredDatabase()) {
    const state = await readState();
    return [
      {
        userId: state.user.id,
        email: state.user.email,
        name: state.user.name,
        role: "owner",
        createdAt: new Date().toISOString(),
      },
    ];
  }

  const prisma = getPrismaClient();
  const { budget } = await getBudgetContext();

  const members = await prisma.budgetMember.findMany({
    where: { budgetId: budget.id },
    include: { user: true },
    orderBy: { createdAt: "asc" },
  });

  return members.map((member) => ({
    userId: member.userId,
    email: member.user.email,
    name: member.user.name ?? "",
    role: member.role,
    createdAt: member.createdAt.toISOString(),
  }));
}

export async function createBudgetInvite(email: string) {
  if (!hasConfiguredDatabase()) {
    throw new Error("Invites require a database.");
  }

  const prisma = getPrismaClient();
  const { authedUser, budget, membership } = await getBudgetContext();

  if (membership.role !== "owner") {
    throw new Error("Only budget owners can invite members.");
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) {
    throw new Error("Email is required.");
  }

  const token = randomUUID();

  const invite = await prisma.budgetInvite.create({
    data: {
      budgetId: budget.id,
      email: normalizedEmail,
      token,
      invitedByUserId: authedUser.id,
    },
  });

  return invite.token;
}

export async function acceptBudgetInvite(token: string) {
  if (!hasConfiguredDatabase()) {
    throw new Error("Invites require a database.");
  }

  const prisma = getPrismaClient();
  const authedUser = await getAuthedUser();

  const invite = await prisma.budgetInvite.findFirst({
    where: { token, acceptedAt: null },
  });

  if (!invite) {
    throw new Error("Invite is invalid or already used.");
  }

  // Ensure the signed-in user's email matches the invite target.
  const email = (authedUser.email ?? "").trim().toLowerCase();
  if (!email || email !== invite.email.toLowerCase()) {
    throw new Error("This invite was created for a different email address.");
  }

  await prisma.user.upsert({
    where: { id: authedUser.id },
    update: { email },
    create: { id: authedUser.id, email },
  });

  await prisma.budgetMember.create({
    data: {
      budgetId: invite.budgetId,
      userId: authedUser.id,
      role: "member",
    },
  });

  await prisma.budgetInvite.update({
    where: { id: invite.id },
    data: { acceptedAt: new Date() },
  });
}

export async function createCommitment(input: {
  name: string;
  amount: number;
  frequency: StoredCommitment["frequency"];
  nextDueDate: string;
  category: CommitmentCategory;
  fundedByIncomeId?: string;
}) {
  if (hasConfiguredDatabase()) {
    const prisma = getPrismaClient();
    const authedUser = await getAuthedUser();
    const budget = await getOrCreateActiveBudget({
      userId: authedUser.id,
      email: authedUser.email ?? "",
      name: (authedUser.user_metadata?.["name"] as string | undefined) ?? "",
    });

    const incomes = await prisma.income.findMany({
      where: { budgetId: budget.id },
      orderBy: { createdAt: "asc" },
    });

    if (incomes.length === 0) {
      throw new Error("No income found to create a commitment.");
    }

    const primaryIncomeId =
      incomes.find((income) => income.isPrimary)?.id ?? incomes[0]!.id;

    await prisma.commitment.create({
      data: {
        budgetId: budget.id,
        name: input.name,
        amount: input.amount,
        frequency: input.frequency,
        nextDueDate: new Date(`${input.nextDueDate}T00:00:00Z`),
        category: input.category,
        fundedByIncomeId: input.fundedByIncomeId ?? primaryIncomeId,
      },
    });
    return;
  }

  const state = await readState();
  state.commitments.push({
    id: randomUUID(),
    ...input,
  });
  await writeState(state);
}

export async function updateCommitment(
  id: string,
  input: {
    name: string;
    amount: number;
    frequency: StoredCommitment["frequency"];
    nextDueDate: string;
    category: CommitmentCategory;
    fundedByIncomeId?: string;
  },
) {
  if (hasConfiguredDatabase()) {
    const prisma = getPrismaClient();
    await prisma.commitment.update({
      where: { id },
      data: {
        name: input.name,
        amount: input.amount,
        frequency: input.frequency,
        nextDueDate: new Date(`${input.nextDueDate}T00:00:00Z`),
        category: input.category,
        fundedByIncomeId: input.fundedByIncomeId,
      },
    });
    return;
  }

  const state = await readState();
  state.commitments = state.commitments.map((commitment) =>
    commitment.id === id ? { ...commitment, ...input } : commitment,
  );
  await writeState(state);
}

export async function deleteCommitment(id: string) {
  if (hasConfiguredDatabase()) {
    const prisma = getPrismaClient();
    await prisma.commitment.delete({ where: { id } });
    return;
  }

  const state = await readState();
  state.commitments = state.commitments.filter((commitment) => commitment.id !== id);
  await writeState(state);
}

export async function createGoal(input: {
  name: string;
  contributionPerPay: number;
  currentBalance: number;
  targetAmount?: number;
  targetDate?: string;
  fundedByIncomeId?: string;
}) {
  if (hasConfiguredDatabase()) {
    const prisma = getPrismaClient();
    const authedUser = await getAuthedUser();
    const budget = await getOrCreateActiveBudget({
      userId: authedUser.id,
      email: authedUser.email ?? "",
      name: (authedUser.user_metadata?.["name"] as string | undefined) ?? "",
    });

    const incomes = await prisma.income.findMany({
      where: { budgetId: budget.id },
      orderBy: { createdAt: "asc" },
    });

    if (incomes.length === 0) {
      throw new Error("No income found to create a goal.");
    }

    const primaryIncomeId =
      incomes.find((income) => income.isPrimary)?.id ?? incomes[0]!.id;

    await prisma.goal.create({
      data: {
        budgetId: budget.id,
        name: input.name,
        contributionPerPay: input.contributionPerPay,
        currentBalance: input.currentBalance,
        targetAmount: input.targetAmount ?? null,
        targetDate: input.targetDate
          ? new Date(`${input.targetDate}T00:00:00Z`)
          : null,
        fundedByIncomeId: input.fundedByIncomeId ?? primaryIncomeId,
      },
    });
    return;
  }

  const state = await readState();
  state.goals.push({
    id: randomUUID(),
    ...input,
  });
  await writeState(state);
}
