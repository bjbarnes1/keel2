import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { pickCommitmentVersionAt } from "@/lib/commitment-version";
import { pickIncomeVersionAt } from "@/lib/income-version";
import { getPrismaClient } from "@/lib/prisma";
import type { CommitmentCategory } from "@/lib/types";

import { toIsoDate } from "@/lib/utils";

import { getAuthedUser, getOrCreateActiveBudget } from "./auth";
import { hasConfiguredDatabase, hasSupabaseAuthConfigured, isHostedProduction } from "./config";

export type StoredUser = {
  id: string;
  email: string;
  name: string;
  bankBalance: number;
  balanceAsOf: string;
};

export type StoredBudget = {
  id: string;
  name: string;
};

export type StoredIncome = {
  id: string;
  name: string;
  amount: number;
  frequency: "weekly" | "fortnightly" | "monthly";
  nextPayDate: string;
  isPrimary?: boolean;
};

export type StoredCommitment = {
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
  archivedAt?: string | null;
};

export type StoredGoal = {
  id: string;
  name: string;
  contributionPerPay: number;
  currentBalance: number;
  targetAmount?: number;
  targetDate?: string;
  fundedByIncomeId?: string;
};

export type StoredKeelState = {
  user: StoredUser;
  budget: StoredBudget;
  incomes: StoredIncome[];
  primaryIncomeId: string;
  commitments: StoredCommitment[];
  goals: StoredGoal[];
};

const demoStorePath = path.join(process.cwd(), "data", "dev-store.json");

// Fix #9: module-level formatter avoids recreating Intl.DateTimeFormat on every call.
const SHORT_DATE_FMT = new Intl.DateTimeFormat("en-AU", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

export function formatShortDate(isoDate: string) {
  return SHORT_DATE_FMT.format(new Date(`${isoDate}T00:00:00Z`));
}

function normalizeDemoState(raw: StoredKeelState): StoredKeelState {
  return {
    ...raw,
    commitments: raw.commitments.filter((c) => !c.archivedAt),
  };
}

export async function readDemoStore() {
  const file = await readFile(demoStorePath, "utf8");
  return normalizeDemoState(JSON.parse(file) as StoredKeelState);
}

export async function writeDemoStore(state: StoredKeelState) {
  await mkdir(path.dirname(demoStorePath), { recursive: true });
  await writeFile(demoStorePath, JSON.stringify(state, null, 2));
}

export async function readPrismaState(): Promise<StoredKeelState> {
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
        where: { archivedAt: null },
        orderBy: { nextDueDate: "asc" },
        include: {
          categoryRef: true,
          subcategoryRef: true,
          versions: { orderBy: { effectiveFrom: "desc" } },
        },
      },
      goals: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!budgetWithData) throw new Error("Budget not found.");

  const primaryIncome =
    budgetWithData.incomes.find((i) => i.isPrimary) ?? budgetWithData.incomes[0];
  const primaryIncomeId = primaryIncome?.id;

  if (!primaryIncomeId) {
    const nextPayDate = new Date();
    nextPayDate.setUTCDate(nextPayDate.getUTCDate() + 14);
    const effectiveFrom = new Date(`${toIsoDate(new Date())}T00:00:00Z`);
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
    : toIsoDate(new Date());

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
        : toIsoDate(new Date()),
    },
    budget: { id: budgetWithData.id, name: budgetWithData.name },
    incomes: budgetWithData.incomes.map((income) => {
      const slices =
        income.versions?.map((v) => ({
          effectiveFrom: v.effectiveFrom,
          effectiveTo: v.effectiveTo,
          name: v.name,
          amount: Number(v.amount),
          frequency: v.frequency,
          nextPayDate: v.nextPayDate,
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
    commitments: budgetWithData.commitments.map((commitment) => {
      const slices =
        commitment.versions?.map((v) => ({
          effectiveFrom: v.effectiveFrom,
          effectiveTo: v.effectiveTo,
          name: v.name,
          amount: Number(v.amount),
          frequency: v.frequency,
          nextDueDate: v.nextDueDate,
          categoryId: v.categoryId,
          subcategoryId: v.subcategoryId,
          fundedByIncomeId: v.fundedByIncomeId,
        })) ?? [];
      const picked = pickCommitmentVersionAt(slices, asOfIso);
      const categoryId = picked?.categoryId ?? commitment.categoryId;
      const subcategoryId = picked?.subcategoryId ?? commitment.subcategoryId ?? null;
      return {
        id: commitment.id,
        name: picked?.name ?? commitment.name,
        amount: picked ? picked.amount : Number(commitment.amount),
        frequency: (picked?.frequency ?? commitment.frequency) as StoredCommitment["frequency"],
        nextDueDate: (picked ? picked.nextDueDate : commitment.nextDueDate)
          .toISOString()
          .slice(0, 10),
        categoryId,
        category: commitment.categoryRef.name as CommitmentCategory,
        subcategoryId: subcategoryId ?? undefined,
        subcategory: commitment.subcategoryRef?.name ?? undefined,
        fundedByIncomeId:
          picked?.fundedByIncomeId ?? commitment.fundedByIncomeId ?? undefined,
        archivedAt: commitment.archivedAt ? commitment.archivedAt.toISOString() : undefined,
      };
    }),
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

export async function readState(): Promise<StoredKeelState> {
  if (hasConfiguredDatabase()) {
    if (!hasSupabaseAuthConfigured()) return readDemoStore();
    return readPrismaState();
  }
  return readDemoStore();
}

export async function writeState(state: StoredKeelState) {
  if (isHostedProduction()) {
    throw new Error(
      "Persistence requires DATABASE_URL in production deployments. Configure Postgres before using write actions on Vercel.",
    );
  }
  await writeDemoStore(state);
}
