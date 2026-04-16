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
  incomes: StoredIncome[];
  primaryIncomeId: string;
  commitments: StoredCommitment[];
  goals: StoredGoal[];
};

export type DashboardSnapshot = {
  userName: string;
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

async function readPrismaState(): Promise<StoredKeelState> {
  const prisma = getPrismaClient();
  const user = await prisma.user.findFirst({
    include: {
      incomes: { orderBy: { createdAt: "asc" } },
      commitments: { orderBy: { nextDueDate: "asc" } },
      goals: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!user || user.incomes.length === 0) {
    return readDemoStore();
  }

  const primaryIncome =
    user.incomes.find((income) => income.isPrimary) ?? user.incomes[0];
  const primaryIncomeId = primaryIncome?.id;

  if (!primaryIncomeId) {
    return readDemoStore();
  }

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name ?? "Keel User",
      bankBalance: Number(user.bankBalance),
      balanceAsOf: user.balanceAsOf
        ? user.balanceAsOf.toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10),
    },
    incomes: user.incomes.map((income) => ({
      id: income.id,
      name: income.name,
      amount: Number(income.amount),
      frequency: income.frequency as StoredIncome["frequency"],
      nextPayDate: income.nextPayDate.toISOString().slice(0, 10),
      isPrimary: income.isPrimary,
    })),
    primaryIncomeId,
    commitments: user.commitments.map((commitment) => ({
      id: commitment.id,
      name: commitment.name,
      amount: Number(commitment.amount),
      frequency: commitment.frequency as StoredCommitment["frequency"],
      nextDueDate: commitment.nextDueDate.toISOString().slice(0, 10),
      category: (commitment.category ?? "Other") as CommitmentCategory,
      fundedByIncomeId: commitment.fundedByIncomeId ?? undefined,
    })),
    goals: user.goals.map((goal) => ({
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
    const existingUser = await prisma.user.findFirst();

    if (!existingUser) {
      throw new Error("No user found to update bank balance.");
    }

    await prisma.user.update({
      where: { id: existingUser.id },
      data: {
        bankBalance: amount,
        balanceAsOf: new Date(),
      },
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
    const existingUser = await prisma.user.findFirst();

    if (!existingUser) {
      throw new Error("No user found to create an income.");
    }

    if (input.isPrimary) {
      await prisma.income.updateMany({
        where: { userId: existingUser.id },
        data: { isPrimary: false },
      });
    }

    await prisma.income.create({
      data: {
        userId: existingUser.id,
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
    const existingUser = await prisma.user.findFirst();

    if (!existingUser) {
      throw new Error("No user found to set primary income.");
    }

    await prisma.income.updateMany({
      where: { userId: existingUser.id },
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
    const existingUser = await prisma.user.findFirst({
      include: { incomes: { orderBy: { createdAt: "asc" } } },
    });

    if (!existingUser) {
      throw new Error("No user found to delete income.");
    }

    const remaining = existingUser.incomes.filter((income) => income.id !== incomeId);
    if (remaining.length === 0) {
      throw new Error("You must have at least one income.");
    }

    await prisma.income.delete({ where: { id: incomeId } });

    // If we deleted the primary, promote the oldest remaining.
    const deletedWasPrimary = existingUser.incomes.some(
      (income) => income.id === incomeId && income.isPrimary,
    );

    if (deletedWasPrimary) {
      await prisma.income.updateMany({
        where: { userId: existingUser.id },
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
    const existingUser = await prisma.user.findFirst({
      include: { incomes: { orderBy: { createdAt: "asc" } } },
    });

    if (!existingUser || existingUser.incomes.length === 0) {
      throw new Error("No user/income found to create a commitment.");
    }

    const primaryIncomeId =
      existingUser.incomes.find((income) => income.isPrimary)?.id ??
      existingUser.incomes[0]?.id;

    await prisma.commitment.create({
      data: {
        userId: existingUser.id,
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
    const existingUser = await prisma.user.findFirst({
      include: { incomes: { orderBy: { createdAt: "asc" } } },
    });

    if (!existingUser || existingUser.incomes.length === 0) {
      throw new Error("No user/income found to create a goal.");
    }

    const primaryIncomeId =
      existingUser.incomes.find((income) => income.isPrimary)?.id ??
      existingUser.incomes[0]?.id;

    await prisma.goal.create({
      data: {
        userId: existingUser.id,
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
