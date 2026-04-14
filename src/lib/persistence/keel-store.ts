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
};

type StoredCommitment = {
  id: string;
  name: string;
  amount: number;
  frequency: "weekly" | "fortnightly" | "monthly" | "quarterly" | "annual";
  nextDueDate: string;
  category: CommitmentCategory;
};

type StoredGoal = {
  id: string;
  name: string;
  contributionPerPay: number;
  currentBalance: number;
  targetAmount?: number;
  targetDate?: string;
};

type StoredKeelState = {
  user: StoredUser;
  income: StoredIncome;
  commitments: StoredCommitment[];
  goals: StoredGoal[];
};

export type DashboardSnapshot = {
  userName: string;
  bankBalance: number;
  balanceAsOf: string;
  income: IncomeView;
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
      incomes: { take: 1, orderBy: { createdAt: "asc" } },
      commitments: { orderBy: { nextDueDate: "asc" } },
      goals: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!user || user.incomes.length === 0) {
    return readDemoStore();
  }

  const income = user.incomes[0];

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
    income: {
      id: income.id,
      name: income.name,
      amount: Number(income.amount),
      frequency: income.frequency as StoredIncome["frequency"],
      nextPayDate: income.nextPayDate.toISOString().slice(0, 10),
    },
    commitments: user.commitments.map((commitment) => ({
      id: commitment.id,
      name: commitment.name,
      amount: Number(commitment.amount),
      frequency: commitment.frequency as StoredCommitment["frequency"],
      nextDueDate: commitment.nextDueDate.toISOString().slice(0, 10),
      category: (commitment.category ?? "Other") as CommitmentCategory,
    })),
    goals: user.goals.map((goal) => ({
      id: goal.id,
      name: goal.name,
      contributionPerPay: Number(goal.contributionPerPay),
      currentBalance: Number(goal.currentBalance),
      targetAmount: goal.targetAmount ? Number(goal.targetAmount) : undefined,
      targetDate: goal.targetDate?.toISOString().slice(0, 10),
    })),
  };
}

async function readState() {
  if (hasConfiguredDatabase()) {
    return readPrismaState();
  }

  return readDemoStore();
}

async function writePrismaState(state: StoredKeelState) {
  const prisma = getPrismaClient();
  const existingUser = await prisma.user.findFirst();

  const user = existingUser
    ? await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          email: state.user.email,
          name: state.user.name,
          bankBalance: state.user.bankBalance,
          balanceAsOf: new Date(`${state.user.balanceAsOf}T00:00:00Z`),
        },
      })
    : await prisma.user.create({
        data: {
          id: state.user.id,
          email: state.user.email,
          name: state.user.name,
          bankBalance: state.user.bankBalance,
          balanceAsOf: new Date(`${state.user.balanceAsOf}T00:00:00Z`),
        },
      });

  await prisma.income.deleteMany({ where: { userId: user.id } });
  await prisma.commitment.deleteMany({ where: { userId: user.id } });
  await prisma.goal.deleteMany({ where: { userId: user.id } });

  await prisma.income.create({
    data: {
      id: state.income.id,
      userId: user.id,
      name: state.income.name,
      amount: state.income.amount,
      frequency: state.income.frequency,
      nextPayDate: new Date(`${state.income.nextPayDate}T00:00:00Z`),
    },
  });

  await prisma.commitment.createMany({
    data: state.commitments.map((commitment) => ({
      id: commitment.id,
      userId: user.id,
      name: commitment.name,
      amount: commitment.amount,
      frequency: commitment.frequency,
      nextDueDate: new Date(`${commitment.nextDueDate}T00:00:00Z`),
      category: commitment.category,
    })),
  });

  await prisma.goal.createMany({
    data: state.goals.map((goal) => ({
      id: goal.id,
      userId: user.id,
      name: goal.name,
      contributionPerPay: goal.contributionPerPay,
      currentBalance: goal.currentBalance,
      targetAmount: goal.targetAmount,
      targetDate: goal.targetDate
        ? new Date(`${goal.targetDate}T00:00:00Z`)
        : null,
    })),
  });
}

async function writeState(state: StoredKeelState) {
  if (hasConfiguredDatabase()) {
    await writePrismaState(state);
    return;
  }

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
    income: state.income,
    commitments: state.commitments,
    goals: state.goals,
    asOf,
  });

  const timelineRaw = buildProjectionTimeline({
    availableMoney: availableMoneyResult.availableMoney,
    asOf,
    horizonDays: 60,
    income: state.income,
    commitments: state.commitments,
  });

  const shortfall = detectProjectedShortfall(timelineRaw);

  return {
    userName: state.user.name,
    bankBalance: state.user.bankBalance,
    balanceAsOf: formatShortDate(state.user.balanceAsOf),
    income: {
      ...state.income,
      nextPayDate: formatShortDate(state.income.nextPayDate),
    },
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

export async function updateBankBalance(amount: number) {
  const state = await readState();
  state.user.bankBalance = amount;
  state.user.balanceAsOf = new Date().toISOString().slice(0, 10);
  await writeState(state);
}

export async function createCommitment(input: {
  name: string;
  amount: number;
  frequency: StoredCommitment["frequency"];
  nextDueDate: string;
  category: CommitmentCategory;
}) {
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
  },
) {
  const state = await readState();
  state.commitments = state.commitments.map((commitment) =>
    commitment.id === id ? { ...commitment, ...input } : commitment,
  );
  await writeState(state);
}

export async function deleteCommitment(id: string) {
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
}) {
  const state = await readState();
  state.goals.push({
    id: randomUUID(),
    ...input,
  });
  await writeState(state);
}
