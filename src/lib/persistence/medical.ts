/**
 * Medical sub-items: expected totals, spend allocation via `SpendTransaction.medicalSubItemId`,
 * and simple rebate flags on transactions.
 *
 * @module lib/persistence/medical
 */

import { unstable_noStore as noStore } from "next/cache";

import { getPrismaClient } from "@/lib/prisma";
import { getBudgetContext } from "./auth";
import { hasConfiguredDatabase, hasSupabaseAuthConfigured } from "./config";

export type MedicalSubItemView = {
  id: string;
  name: string;
  expectedTotal: number | null;
  spent: number;
  sortOrder: number;
};

export async function listMedicalSubItems(): Promise<MedicalSubItemView[]> {
  noStore();
  if (!hasConfiguredDatabase() || !hasSupabaseAuthConfigured()) return [];

  const prisma = getPrismaClient();
  const { budget } = await getBudgetContext();

  const items = await prisma.medicalSubItem.findMany({
    where: { budgetId: budget.id },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  const sums = await prisma.spendTransaction.groupBy({
    by: ["medicalSubItemId"],
    where: { budgetId: budget.id, medicalSubItemId: { not: null }, amount: { lt: 0 } },
    _sum: { amount: true },
  });

  const spentBy = new Map<string, number>();
  for (const row of sums) {
    if (!row.medicalSubItemId) continue;
    spentBy.set(row.medicalSubItemId, Math.abs(Number(row._sum.amount ?? 0)));
  }

  return items.map((m) => ({
    id: m.id,
    name: m.name,
    expectedTotal: m.expectedTotal != null ? Number(m.expectedTotal) : null,
    spent: spentBy.get(m.id) ?? 0,
    sortOrder: m.sortOrder,
  }));
}

export async function createMedicalSubItem(input: { name: string; expectedTotal?: number | null }) {
  if (!hasConfiguredDatabase()) throw new Error("Medical tracking requires a database.");
  const prisma = getPrismaClient();
  const { budget } = await getBudgetContext();
  const name = input.name.trim();
  if (!name) throw new Error("Name is required.");

  await prisma.medicalSubItem.create({
    data: {
      budgetId: budget.id,
      name,
      expectedTotal: input.expectedTotal != null ? input.expectedTotal : null,
    },
  });
}

export async function deleteMedicalSubItem(id: string) {
  if (!hasConfiguredDatabase()) throw new Error("Medical tracking requires a database.");
  const prisma = getPrismaClient();
  const { budget } = await getBudgetContext();
  const row = await prisma.medicalSubItem.findFirst({ where: { id, budgetId: budget.id } });
  if (!row) throw new Error("Item not found.");
  await prisma.medicalSubItem.delete({ where: { id } });
}

export async function setTransactionRebateExpectation(input: {
  transactionId: string;
  expectedAmount: number | null;
}) {
  if (!hasConfiguredDatabase()) throw new Error("Database required.");
  const prisma = getPrismaClient();
  const { budget } = await getBudgetContext();

  const tx = await prisma.spendTransaction.findFirst({
    where: { id: input.transactionId, budgetId: budget.id },
  });
  if (!tx) throw new Error("Transaction not found.");

  await prisma.spendTransaction.update({
    where: { id: tx.id },
    data: {
      rebateExpectedAmount: input.expectedAmount,
      rebateState: input.expectedAmount != null && input.expectedAmount > 0 ? "EXPECTED" : "NONE",
      rebateMatchedAmount: tx.rebateMatchedAmount ?? 0,
    },
  });
}

export type RebateQueueRow = {
  id: string;
  memo: string;
  postedOn: string;
  amount: number;
  expected: number;
  matched: number;
};

export async function listOutstandingRebates(): Promise<RebateQueueRow[]> {
  noStore();
  if (!hasConfiguredDatabase() || !hasSupabaseAuthConfigured()) return [];

  const prisma = getPrismaClient();
  const { budget } = await getBudgetContext();

  const rows = await prisma.spendTransaction.findMany({
    where: {
      budgetId: budget.id,
      rebateState: { in: ["EXPECTED", "PARTIAL"] },
    },
    orderBy: { postedOn: "asc" },
  });

  return rows.map((t) => ({
    id: t.id,
    memo: t.memo,
    postedOn: t.postedOn.toISOString().slice(0, 10),
    amount: Number(t.amount),
    expected: Number(t.rebateExpectedAmount ?? 0),
    matched: Number(t.rebateMatchedAmount ?? 0),
  }));
}

export async function recordRebatePartialMatch(input: {
  expenseTransactionId: string;
  creditTransactionId: string;
  amount: number;
  notes?: string;
}) {
  if (!hasConfiguredDatabase()) throw new Error("Database required.");
  const prisma = getPrismaClient();
  const { budget } = await getBudgetContext();

  const expense = await prisma.spendTransaction.findFirst({
    where: { id: input.expenseTransactionId, budgetId: budget.id },
  });
  const credit = await prisma.spendTransaction.findFirst({
    where: { id: input.creditTransactionId, budgetId: budget.id },
  });
  if (!expense || !credit) throw new Error("Transaction not found.");
  if (input.amount <= 0) throw new Error("Amount must be positive.");

  await prisma.$transaction(async (tx) => {
    await tx.rebateAllocation.create({
      data: {
        budgetId: budget.id,
        expenseId: expense.id,
        creditId: credit.id,
        amount: input.amount,
        notes: input.notes?.trim() || null,
      },
    });

    const matched = Number(expense.rebateMatchedAmount ?? 0) + input.amount;
    const expected = Number(expense.rebateExpectedAmount ?? 0);
    const state =
      expected > 0 && matched + 0.005 >= expected ? "SETTLED" : matched > 0 ? "PARTIAL" : "EXPECTED";

    await tx.spendTransaction.update({
      where: { id: expense.id },
      data: {
        rebateMatchedAmount: matched,
        rebateState: state,
      },
    });
  });
}
