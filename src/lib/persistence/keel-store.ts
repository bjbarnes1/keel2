import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { unstable_noStore as noStore } from "next/cache";

import {
  buildProjectionTimeline,
  calculateAvailableMoney,
  detectProjectedShortfall,
} from "@/lib/engine/keel";
import { pickIncomeVersionAt } from "@/lib/income-version";
import { getPrismaClient } from "@/lib/prisma";
import { buildSpendRows, parseCsv, validateSpendCsvMapping, type SpendCsvMapping } from "@/lib/spend/csv";
import { inclusivePeriodDays, plannedAmountForPeriod } from "@/lib/spend/actual-vs-planned";
import { spendTransactionDedupeKey } from "@/lib/spend/dedupe";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  CommitmentCategory,
  CommitmentFrequency,
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
  categoryId: string;
  category: CommitmentCategory;
  subcategoryId?: string;
  subcategory?: string;
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
  forecast: {
    oneMonth: ForecastHorizon;
    threeMonths: ForecastHorizon;
    twelveMonths: ForecastHorizon;
  };
  alert: string;
};

export type ForecastHorizon = {
  horizonDays: number;
  minProjectedAvailableMoney: number;
  endProjectedAvailableMoney: number;
  incomeEvents: number;
  billEvents: number;
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
      incomes: {
        orderBy: { createdAt: "asc" },
        include: { versions: { orderBy: { effectiveFrom: "desc" } } },
      },
      commitments: {
        orderBy: { nextDueDate: "asc" },
        include: { categoryRef: true, subcategoryRef: true },
      },
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
    const effectiveFrom = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
    const created = await prisma.$transaction(async (tx) => {
      const income = await tx.income.create({
        data: {
          budgetId: budgetWithData.id,
          name: "Income",
          amount: 0,
          frequency: "fortnightly",
          nextPayDate,
          isPrimary: true,
        },
      });
      await tx.incomeVersion.create({
        data: {
          incomeId: income.id,
          effectiveFrom,
          effectiveTo: null,
          name: "Income",
          amount: 0,
          frequency: "fortnightly",
          nextPayDate,
        },
      });
      return tx.income.findFirstOrThrow({
        where: { id: income.id },
        include: { versions: { orderBy: { effectiveFrom: "desc" } } },
      });
    });

    budgetWithData.incomes.push(created);
  }

  const asOfIso = budgetWithData.balanceAsOf
    ? budgetWithData.balanceAsOf.toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);

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
    incomes: budgetWithData.incomes.map((income) => {
      const slices =
        income.versions?.map((version) => ({
          effectiveFrom: version.effectiveFrom,
          effectiveTo: version.effectiveTo,
          name: version.name,
          amount: Number(version.amount),
          frequency: version.frequency,
          nextPayDate: version.nextPayDate,
        })) ?? [];
      const picked = pickIncomeVersionAt(slices, asOfIso);
      return {
        id: income.id,
        name: picked?.name ?? income.name,
        amount: picked ? picked.amount : Number(income.amount),
        frequency: (picked?.frequency ?? income.frequency) as StoredIncome["frequency"],
        nextPayDate: (picked ? picked.nextPayDate : income.nextPayDate)
          .toISOString()
          .slice(0, 10),
        isPrimary: income.isPrimary,
      };
    }),
    primaryIncomeId: primaryIncomeId ?? budgetWithData.incomes[0]!.id,
    commitments: budgetWithData.commitments.map((commitment) => ({
      id: commitment.id,
      name: commitment.name,
      amount: Number(commitment.amount),
      frequency: commitment.frequency as StoredCommitment["frequency"],
      nextDueDate: commitment.nextDueDate.toISOString().slice(0, 10),
      categoryId: commitment.categoryId,
      category: commitment.categoryRef.name,
      subcategoryId: commitment.subcategoryId ?? undefined,
      subcategory: commitment.subcategoryRef?.name ?? undefined,
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

  function summarizeForecast(horizonDays: number): ForecastHorizon {
    const events = buildProjectionTimeline({
      availableMoney: availableMoneyResult.availableMoney,
      asOf,
      horizonDays,
      incomes: state.incomes,
      commitments: state.commitments,
    });

    const minProjected = events.reduce(
      (min, event) => Math.min(min, event.projectedAvailableMoney),
      availableMoneyResult.availableMoney,
    );
    const endProjected =
      events.length > 0
        ? events[events.length - 1]!.projectedAvailableMoney
        : availableMoneyResult.availableMoney;

    return {
      horizonDays,
      minProjectedAvailableMoney: minProjected,
      endProjectedAvailableMoney: endProjected,
      incomeEvents: events.filter((event) => event.type === "income").length,
      billEvents: events.filter((event) => event.type === "bill").length,
    };
  }

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
    forecast: {
      oneMonth: summarizeForecast(31),
      threeMonths: summarizeForecast(92),
      twelveMonths: summarizeForecast(365),
    },
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

export async function getCategoryOptions() {
  noStore();

  if (!hasConfiguredDatabase()) {
    return [
      { id: "cat-housing", name: "Housing", subcategories: [] as Array<{ id: string; name: string }> },
      { id: "cat-insurance", name: "Insurance", subcategories: [] as Array<{ id: string; name: string }> },
      { id: "cat-utilities", name: "Utilities", subcategories: [] as Array<{ id: string; name: string }> },
      { id: "cat-subscriptions", name: "Subscriptions", subcategories: [] as Array<{ id: string; name: string }> },
      { id: "cat-transport", name: "Transport", subcategories: [] as Array<{ id: string; name: string }> },
      { id: "cat-education", name: "Education", subcategories: [] as Array<{ id: string; name: string }> },
      { id: "cat-health", name: "Health", subcategories: [] as Array<{ id: string; name: string }> },
      { id: "cat-other", name: "Other", subcategories: [] as Array<{ id: string; name: string }> },
    ];
  }

  const prisma = getPrismaClient();
  const { budget } = await getBudgetContext();

  const categories = await prisma.category.findMany({
    where: { budgetId: budget.id },
    include: { subcategories: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] } },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  return categories.map((category) => ({
    id: category.id,
    name: category.name,
    subcategories: category.subcategories.map((sub) => ({ id: sub.id, name: sub.name })),
  }));
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

    const effectiveFrom = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
    const nextPayDate = new Date(`${input.nextPayDate}T00:00:00Z`);

    await prisma.$transaction(async (tx) => {
      if (input.isPrimary) {
        await tx.income.updateMany({
          where: { budgetId: budget.id },
          data: { isPrimary: false },
        });
      }

      const income = await tx.income.create({
        data: {
          budgetId: budget.id,
          name: input.name,
          amount: input.amount,
          frequency: input.frequency,
          nextPayDate,
          isPrimary: Boolean(input.isPrimary),
        },
      });

      await tx.incomeVersion.create({
        data: {
          incomeId: income.id,
          effectiveFrom,
          effectiveTo: null,
          name: input.name,
          amount: input.amount,
          frequency: input.frequency,
          nextPayDate,
        },
      });
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

export async function getIncomeForEdit(id: string) {
  noStore();

  if (!hasConfiguredDatabase() || !hasSupabaseAuthConfigured()) {
    return null;
  }

  const prisma = getPrismaClient();
  const { budget } = await getBudgetContext();

  const income = await prisma.income.findFirst({
    where: { id, budgetId: budget.id },
  });

  if (!income) {
    return null;
  }

  return {
    id: income.id,
    name: income.name,
    amount: Number(income.amount),
    frequency: income.frequency as StoredIncome["frequency"],
    nextPayDate: income.nextPayDate.toISOString().slice(0, 10),
    isPrimary: income.isPrimary,
  };
}

export async function updateIncomeFuture(input: {
  incomeId: string;
  name: string;
  amount: number;
  frequency: StoredIncome["frequency"];
  nextPayDate: string;
  effectiveFrom: string;
}) {
  if (!hasConfiguredDatabase()) {
    throw new Error("Income versioning requires a database.");
  }

  const prisma = getPrismaClient();
  const { budget } = await getBudgetContext();

  const income = await prisma.income.findFirst({
    where: { id: input.incomeId, budgetId: budget.id },
  });

  if (!income) {
    throw new Error("Income not found.");
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.effectiveFrom)) {
    throw new Error("Effective date must be YYYY-MM-DD.");
  }

  const todayIso = new Date().toISOString().slice(0, 10);
  if (input.effectiveFrom < todayIso) {
    throw new Error("Changes can only apply from today onward.");
  }

  const effectiveDate = new Date(`${input.effectiveFrom}T00:00:00Z`);
  const nextPayDate = new Date(`${input.nextPayDate}T00:00:00Z`);

  const dayBefore = new Date(effectiveDate);
  dayBefore.setUTCDate(dayBefore.getUTCDate() - 1);
  const dayBeforeIso = dayBefore.toISOString().slice(0, 10);

  await prisma.$transaction(async (tx) => {
    const open = await tx.incomeVersion.findFirst({
      where: { incomeId: input.incomeId, effectiveTo: null },
    });

    if (open) {
      await tx.incomeVersion.update({
        where: { id: open.id },
        data: { effectiveTo: new Date(`${dayBeforeIso}T00:00:00Z`) },
      });
    }

    await tx.incomeVersion.create({
      data: {
        incomeId: input.incomeId,
        effectiveFrom: effectiveDate,
        effectiveTo: null,
        name: input.name.trim(),
        amount: input.amount,
        frequency: input.frequency,
        nextPayDate,
      },
    });

    await tx.income.update({
      where: { id: input.incomeId },
      data: {
        name: input.name.trim(),
        amount: input.amount,
        frequency: input.frequency,
        nextPayDate,
      },
    });
  });
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

export async function getWealthSnapshot() {
  noStore();

  if (!hasConfiguredDatabase()) {
    return { totalValue: 0, holdings: [] as Array<{ id: string; name: string; symbol?: string; quantity: string; value: number; asOf?: string }> };
  }

  const prisma = getPrismaClient();
  const { budget } = await getBudgetContext();

  const holdings = await prisma.wealthHolding.findMany({
    where: { budgetId: budget.id },
    orderBy: { updatedAt: "desc" },
  });

  const mapped = holdings.map((holding) => {
    const quantity = Number(holding.quantity);
    const unitPrice = holding.unitPrice ? Number(holding.unitPrice) : undefined;
    const valueOverride = holding.valueOverride ? Number(holding.valueOverride) : undefined;
    const value =
      valueOverride ?? (unitPrice != null ? quantity * unitPrice : 0);

    return {
      id: holding.id,
      name: holding.name,
      symbol: holding.symbol ?? undefined,
      quantity: String(quantity),
      value,
      asOf: holding.asOf ? holding.asOf.toISOString().slice(0, 10) : undefined,
    };
  });

  return {
    totalValue: mapped.reduce((sum, holding) => sum + holding.value, 0),
    holdings: mapped,
  };
}

export async function createWealthHolding(input: {
  assetType: string;
  symbol?: string;
  name: string;
  quantity: number;
  unitPrice?: number;
  valueOverride?: number;
  asOf?: string;
}) {
  if (!hasConfiguredDatabase()) {
    throw new Error("Wealth tracking requires a database.");
  }

  const prisma = getPrismaClient();
  const { budget } = await getBudgetContext();

  // Minimal MVP: a single default account per budget.
  const account =
    (await prisma.wealthAccount.findFirst({ where: { budgetId: budget.id } })) ??
    (await prisma.wealthAccount.create({
      data: {
        budgetId: budget.id,
        name: "Holdings",
        type: "OTHER",
        currency: "AUD",
      },
    }));

  await prisma.wealthHolding.create({
    data: {
      budgetId: budget.id,
      accountId: account.id,
      assetType: input.assetType,
      symbol: input.symbol ?? null,
      name: input.name,
      quantity: input.quantity,
      unitPrice: input.unitPrice ?? null,
      valueOverride: input.valueOverride ?? null,
      asOf: input.asOf ? new Date(`${input.asOf}T00:00:00Z`) : null,
    },
  });
}

export async function createCommitment(input: {
  name: string;
  amount: number;
  frequency: StoredCommitment["frequency"];
  nextDueDate: string;
  categoryId: string;
  subcategoryId?: string;
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
        categoryId: input.categoryId,
        subcategoryId: input.subcategoryId ?? null,
        fundedByIncomeId: input.fundedByIncomeId ?? primaryIncomeId,
      },
    });
    return;
  }

  const state = await readState();
  state.commitments.push({
    id: randomUUID(),
    ...input,
    category: input.categoryId,
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
    categoryId: string;
    subcategoryId?: string;
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
        categoryId: input.categoryId,
        subcategoryId: input.subcategoryId ?? null,
        fundedByIncomeId: input.fundedByIncomeId,
      },
    });
    return;
  }

  const state = await readState();
  state.commitments = state.commitments.map((commitment) =>
    commitment.id === id
      ? { ...commitment, ...input, category: input.categoryId }
      : commitment,
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

export type SpendAccountView = {
  id: string;
  name: string;
  currency: string;
};

export type SpendTransactionListItem = {
  id: string;
  accountId: string;
  accountName: string;
  postedOn: string;
  amount: number;
  memo: string;
  categoryId?: string;
  categoryName?: string;
  subcategoryId?: string;
  subcategoryName?: string;
  commitmentId?: string;
  commitmentName?: string;
};

export async function getSpendOverview() {
  noStore();

  if (!hasConfiguredDatabase() || !hasSupabaseAuthConfigured()) {
    return {
      accounts: [] as SpendAccountView[],
      recent: [] as SpendTransactionListItem[],
      needsReview: 0,
    };
  }

  const prisma = getPrismaClient();
  const { budget } = await getBudgetContext();

  const accounts = await prisma.spendAccount.findMany({
    where: { budgetId: budget.id },
    orderBy: { createdAt: "asc" },
  });

  const recent = await prisma.spendTransaction.findMany({
    where: { budgetId: budget.id },
    orderBy: [{ postedOn: "desc" }, { id: "desc" }],
    take: 10,
    include: {
      account: true,
      categoryRef: true,
      subcategoryRef: true,
      commitment: true,
    },
  });

  const needsReview = await prisma.spendTransaction.count({
    where: { budgetId: budget.id, categoryId: null },
  });

  return {
    accounts: accounts.map((account) => ({
      id: account.id,
      name: account.name,
      currency: account.currency,
    })),
    recent: recent.map((transaction) => ({
      id: transaction.id,
      accountId: transaction.accountId,
      accountName: transaction.account.name,
      postedOn: transaction.postedOn.toISOString().slice(0, 10),
      amount: Number(transaction.amount),
      memo: transaction.memo,
      categoryId: transaction.categoryId ?? undefined,
      categoryName: transaction.categoryRef?.name,
      subcategoryId: transaction.subcategoryId ?? undefined,
      subcategoryName: transaction.subcategoryRef?.name,
      commitmentId: transaction.commitmentId ?? undefined,
      commitmentName: transaction.commitment?.name,
    })),
    needsReview,
  };
}

export async function createSpendAccount(input: { name: string }) {
  if (!hasConfiguredDatabase()) {
    throw new Error("Spend tracking requires a database.");
  }

  const prisma = getPrismaClient();
  const { budget } = await getBudgetContext();

  const name = input.name.trim();
  if (!name) {
    throw new Error("Account name is required.");
  }

  await prisma.spendAccount.create({
    data: {
      budgetId: budget.id,
      name,
      currency: "AUD",
    },
  });
}

export async function commitSpendCsvImport(input: {
  accountId: string;
  csvText: string;
  mapping: SpendCsvMapping;
  filename?: string;
}) {
  if (!hasConfiguredDatabase()) {
    throw new Error("Spend import requires a database.");
  }

  const prisma = getPrismaClient();
  const { budget } = await getBudgetContext();

  const account = await prisma.spendAccount.findFirst({
    where: { id: input.accountId, budgetId: budget.id },
  });

  if (!account) {
    throw new Error("Account not found.");
  }

  const parsed = parseCsv(input.csvText);
  const mappingError = validateSpendCsvMapping(parsed.headers, input.mapping);
  if (mappingError) {
    throw new Error(mappingError);
  }

  const built = buildSpendRows(parsed.headers, parsed.rows, input.mapping);
  if (built.rows.length === 0) {
    const firstIssue = [...parsed.errors, ...built.errors][0];
    throw new Error(firstIssue?.message ?? "No importable rows were found.");
  }

  const batch = await prisma.spendImportBatch.create({
    data: {
      budgetId: budget.id,
      accountId: account.id,
      filename: input.filename ?? null,
      rowCount: 0,
    },
  });

  const data = built.rows.map((row) => ({
    budgetId: budget.id,
    accountId: account.id,
    importBatchId: batch.id,
    postedOn: new Date(`${row.postedOn}T00:00:00Z`),
    amount: row.amount,
    memo: row.memo,
    dedupeKey: spendTransactionDedupeKey({
      accountId: account.id,
      postedOn: row.postedOn,
      amount: row.amount,
      memo: row.memo,
    }),
  }));

  const result = await prisma.spendTransaction.createMany({
    data,
    skipDuplicates: true,
  });

  await prisma.spendImportBatch.update({
    where: { id: batch.id },
    data: { rowCount: result.count },
  });

  return {
    inserted: result.count,
    skipped: data.length - result.count,
    issueCount: parsed.errors.length + built.errors.length,
  };
}

export async function getBudgetCommitmentsForTagging() {
  noStore();

  if (!hasConfiguredDatabase() || !hasSupabaseAuthConfigured()) {
    return [] as Array<{ id: string; name: string }>;
  }

  const prisma = getPrismaClient();
  const { budget } = await getBudgetContext();

  const commitments = await prisma.commitment.findMany({
    where: { budgetId: budget.id, isPaused: false },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return commitments.map((commitment) => ({
    id: commitment.id,
    name: commitment.name,
  }));
}

export async function getSpendReconciliationQueue(limit = 80) {
  noStore();

  if (!hasConfiguredDatabase() || !hasSupabaseAuthConfigured()) {
    return [] as SpendTransactionListItem[];
  }

  const prisma = getPrismaClient();
  const { budget } = await getBudgetContext();

  const rows = await prisma.spendTransaction.findMany({
    where: { budgetId: budget.id, categoryId: null },
    orderBy: [{ postedOn: "desc" }, { id: "desc" }],
    take: limit,
    include: {
      account: true,
      categoryRef: true,
      subcategoryRef: true,
      commitment: true,
    },
  });

  return rows.map((transaction) => ({
    id: transaction.id,
    accountId: transaction.accountId,
    accountName: transaction.account.name,
    postedOn: transaction.postedOn.toISOString().slice(0, 10),
    amount: Number(transaction.amount),
    memo: transaction.memo,
    categoryId: transaction.categoryId ?? undefined,
    categoryName: transaction.categoryRef?.name,
    subcategoryId: transaction.subcategoryId ?? undefined,
    subcategoryName: transaction.subcategoryRef?.name,
    commitmentId: transaction.commitmentId ?? undefined,
    commitmentName: transaction.commitment?.name,
  }));
}

export async function updateSpendTransactionClassification(input: {
  transactionId: string;
  categoryId: string | null;
  subcategoryId?: string | null;
  commitmentId?: string | null;
}) {
  if (!hasConfiguredDatabase()) {
    throw new Error("Spend tracking requires a database.");
  }

  const prisma = getPrismaClient();
  const { budget } = await getBudgetContext();

  const transaction = await prisma.spendTransaction.findFirst({
    where: { id: input.transactionId, budgetId: budget.id },
  });

  if (!transaction) {
    throw new Error("Transaction not found.");
  }

  let categoryId = input.categoryId;
  let subcategoryId = input.subcategoryId ?? null;

  if (!categoryId) {
    categoryId = null;
    subcategoryId = null;
  }

  if (subcategoryId && categoryId) {
    const subcategory = await prisma.subcategory.findFirst({
      where: { id: subcategoryId, categoryId },
    });

    if (!subcategory) {
      throw new Error("Subcategory does not match the selected category.");
    }
  }

  const commitmentId = input.commitmentId ?? null;
  if (commitmentId) {
    const commitment = await prisma.commitment.findFirst({
      where: { id: commitmentId, budgetId: budget.id },
    });

    if (!commitment) {
      throw new Error("Bill not found.");
    }
  }

  await prisma.spendTransaction.update({
    where: { id: transaction.id },
    data: {
      categoryId,
      subcategoryId,
      commitmentId,
    },
  });
}

export type ActualVsPlannedRow = {
  categoryId: string | null;
  categoryName: string;
  planned: number;
  actual: number;
  variance: number;
};

export type ActualVsPlannedReport = {
  start: string;
  end: string;
  periodDays: number;
  monthKey: string;
  rows: ActualVsPlannedRow[];
  totals: {
    planned: number;
    actual: number;
    variance: number;
  };
};

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function utcMonthRangeFromKey(monthKey: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isFinite(year) || month < 1 || month > 12) {
    return null;
  }

  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

function currentUtcMonthKey() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  return `${year}-${month.toString().padStart(2, "0")}`;
}

export async function getActualVsPlannedReport(monthKey?: string) {
  noStore();

  const key = monthKey && utcMonthRangeFromKey(monthKey) ? monthKey : currentUtcMonthKey();
  const range = utcMonthRangeFromKey(key);
  if (!range) {
    return {
      start: "",
      end: "",
      periodDays: 0,
      monthKey: currentUtcMonthKey(),
      rows: [],
      totals: { planned: 0, actual: 0, variance: 0 },
    };
  }

  const { start, end } = range;
  const periodDays = inclusivePeriodDays(start, end);
  if (periodDays <= 0) {
    return {
      start,
      end,
      periodDays: 0,
      monthKey: key,
      rows: [],
      totals: { planned: 0, actual: 0, variance: 0 },
    };
  }

  if (!hasConfiguredDatabase() || !hasSupabaseAuthConfigured()) {
    return {
      start,
      end,
      periodDays,
      monthKey: key,
      rows: [],
      totals: { planned: 0, actual: 0, variance: 0 },
    };
  }

  const prisma = getPrismaClient();
  const { budget } = await getBudgetContext();

  const [commitments, categoryRows, spendGroups] = await Promise.all([
    prisma.commitment.findMany({
      where: { budgetId: budget.id, isPaused: false },
      include: { categoryRef: true },
    }),
    prisma.category.findMany({
      where: { budgetId: budget.id },
      select: { id: true, name: true },
    }),
    prisma.spendTransaction.groupBy({
      by: ["categoryId"],
      where: {
        budgetId: budget.id,
        postedOn: {
          gte: new Date(`${start}T00:00:00Z`),
          lte: new Date(`${end}T00:00:00Z`),
        },
        amount: { lt: 0 },
      },
      _sum: { amount: true },
    }),
  ]);

  const categoryNames = new Map(categoryRows.map((row) => [row.id, row.name]));

  const plannedByCategory = new Map<string, { name: string; amount: number }>();
  for (const commitment of commitments) {
    const slice = plannedAmountForPeriod(
      Number(commitment.amount),
      commitment.frequency as CommitmentFrequency,
      periodDays,
    );
    const existing = plannedByCategory.get(commitment.categoryId);
    const name = commitment.categoryRef.name;
    if (existing) {
      existing.amount += slice;
    } else {
      plannedByCategory.set(commitment.categoryId, { name, amount: slice });
    }
  }

  const actualByCategory = new Map<string | null, number>();
  for (const row of spendGroups) {
    const raw = Number(row._sum.amount ?? 0);
    const spend = Math.abs(raw);
    actualByCategory.set(row.categoryId, spend);
  }

  const ids = new Set<string>();
  for (const id of plannedByCategory.keys()) {
    ids.add(id);
  }
  for (const id of actualByCategory.keys()) {
    if (id !== null) {
      ids.add(id);
    }
  }

  const rows: ActualVsPlannedRow[] = [];
  for (const id of ids) {
    const planned = plannedByCategory.get(id)?.amount ?? 0;
    const actual = actualByCategory.get(id) ?? 0;
    const name =
      plannedByCategory.get(id)?.name ?? categoryNames.get(id) ?? "Unknown category";

    if (planned < 0.005 && actual < 0.005) {
      continue;
    }

    const plannedRounded = roundMoney(planned);
    const actualRounded = roundMoney(actual);
    rows.push({
      categoryId: id,
      categoryName: name,
      planned: plannedRounded,
      actual: actualRounded,
      variance: roundMoney(plannedRounded - actualRounded),
    });
  }

  const uncategorized = actualByCategory.get(null) ?? 0;
  if (uncategorized > 0.005) {
    const actualRounded = roundMoney(uncategorized);
    rows.push({
      categoryId: null,
      categoryName: "Uncategorized",
      planned: 0,
      actual: actualRounded,
      variance: roundMoney(-actualRounded),
    });
  }

  rows.sort((left, right) => {
    if (left.categoryId === null) {
      return 1;
    }
    if (right.categoryId === null) {
      return -1;
    }
    return left.categoryName.localeCompare(right.categoryName);
  });

  const totals = rows.reduce(
    (acc, row) => ({
      planned: roundMoney(acc.planned + row.planned),
      actual: roundMoney(acc.actual + row.actual),
      variance: roundMoney(acc.variance + row.variance),
    }),
    { planned: 0, actual: 0, variance: 0 },
  );

  return {
    start,
    end,
    periodDays,
    monthKey: key,
    rows,
    totals,
  } satisfies ActualVsPlannedReport;
}
