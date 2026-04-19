import { unstable_noStore as noStore } from "next/cache";

import { getPrismaClient } from "@/lib/prisma";
import { inclusivePeriodDays, plannedAmountForPeriod } from "@/lib/spend/actual-vs-planned";
import type { CommitmentFrequency } from "@/lib/types";
import { roundMoney } from "@/lib/utils";

import { getBudgetContext } from "./auth";
import { hasConfiguredDatabase, hasSupabaseAuthConfigured } from "./config";

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
  totals: { planned: number; actual: number; variance: number };
};

function utcMonthRangeFromKey(monthKey: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isFinite(year) || month < 1 || month > 12) return null;

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

export async function getActualVsPlannedReport(monthKey?: string): Promise<ActualVsPlannedReport> {
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
      where: { budgetId: budget.id, isPaused: false, archivedAt: null },
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
    actualByCategory.set(row.categoryId, Math.abs(raw));
  }

  const ids = new Set<string>();
  for (const id of plannedByCategory.keys()) ids.add(id);
  for (const id of actualByCategory.keys()) {
    if (id !== null) ids.add(id);
  }

  const rows: ActualVsPlannedRow[] = [];
  for (const id of ids) {
    const planned = plannedByCategory.get(id)?.amount ?? 0;
    const actual = actualByCategory.get(id) ?? 0;
    const name =
      plannedByCategory.get(id)?.name ?? categoryNames.get(id) ?? "Unknown category";

    if (planned < 0.005 && actual < 0.005) continue;

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
    if (left.categoryId === null) return 1;
    if (right.categoryId === null) return -1;
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
  };
}
