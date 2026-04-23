/**
 * JSON file–backed persistence for local development without Postgres.
 *
 * Stores a single `StoredKeelState` document under `.keel/state.json` (path resolved
 * relative to the process cwd). Versioned income/commitment rows use effective dating
 * via `pickIncomeVersionAt` / `pickCommitmentVersionAt` so edits behave like the Prisma
 * “append-only versions” model.
 *
 * **Not for production:** concurrent writes are last-write-wins; no RLS. When
 * `hasConfiguredDatabase()` is true, callers should use Prisma modules instead.
 *
 * @module lib/persistence/state
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { pickCommitmentVersionAt } from "@/lib/commitment-version";
import { pickIncomeVersionAt } from "@/lib/income-version";
import { getPrismaClient } from "@/lib/prisma";
import type { CommitmentCategory } from "@/lib/types";

import { formatDisplayDate, toIsoDate } from "@/lib/utils";

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
  /** Set when income is archived (hidden from active budget math). */
  archivedAt?: string | null;
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

export function narrowIncomeFrequency(raw: string): StoredIncome["frequency"] {
  if (raw === "weekly" || raw === "fortnightly" || raw === "monthly") return raw;
  console.warn(`[narrowIncomeFrequency] unexpected value: "${raw}", falling back to "fortnightly"`);
  return "fortnightly";
}

export function narrowCommitmentFrequency(raw: string): StoredCommitment["frequency"] {
  if (
    raw === "weekly" ||
    raw === "fortnightly" ||
    raw === "monthly" ||
    raw === "quarterly" ||
    raw === "annual"
  )
    return raw;
  console.warn(
    `[narrowCommitmentFrequency] unexpected value: "${raw}", falling back to "monthly"`,
  );
  return "monthly";
}

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

/** @deprecated Prefer {@link formatDisplayDate} from `@/lib/utils` — kept for persistence imports. */
export function formatShortDate(isoDate: string) {
  return formatDisplayDate(isoDate, "short");
}

function normalizeDemoState(raw: StoredKeelState): StoredKeelState {
  return {
    ...raw,
    /** Keep archived commitments in the document so archive/restore/file flows stay coherent. */
    commitments: raw.commitments,
    incomes: raw.incomes.filter((i) => !i.archivedAt),
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
        where: { archivedAt: null },
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
        frequency: narrowIncomeFrequency(picked?.frequency ?? income.frequency),
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
        frequency: narrowCommitmentFrequency(picked?.frequency ?? commitment.frequency),
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
