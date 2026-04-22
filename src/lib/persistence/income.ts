/**
 * Income CRUD and pay-date versioning.
 *
 * The Prisma implementation stores time-varying fields on `IncomeVersion` so historical
 * projections can be recomputed accurately. The demo-store path keeps parallel arrays
 * on the JSON document.
 *
 * @module lib/persistence/income
 */

import { randomUUID } from "node:crypto";

import { unstable_noStore as noStore } from "next/cache";

import { getPrismaClient } from "@/lib/prisma";
import { toIsoDate } from "@/lib/utils";

import { getBudgetContext } from "./auth";
import { hasConfiguredDatabase, hasSupabaseAuthConfigured } from "./config";
import { narrowIncomeFrequency, readState, writeState, type StoredIncome } from "./state";

export async function getIncomeSnapshot() {
  noStore();
  const state = await readState();
  return {
    incomes: state.incomes,
    primaryIncomeId: state.primaryIncomeId,
  };
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
    const { budget } = await getBudgetContext();

    const effectiveFrom = new Date(`${toIsoDate(new Date())}T00:00:00Z`);
    const nextPayDate = new Date(`${input.nextPayDate}T00:00:00Z`);

    await prisma.$transaction(async (tx) => {
      if (input.isPrimary) {
        await tx.income.updateMany({
          where: { budgetId: budget.id, archivedAt: null },
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
  const next: StoredIncome = {
    id: incomeId,
    name: input.name,
    amount: input.amount,
    frequency: input.frequency,
    nextPayDate: input.nextPayDate,
    isPrimary: Boolean(input.isPrimary),
  };

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
    const state = await readState();
    const income = state.incomes.find((row) => row.id === id && !row.archivedAt);
    if (!income) return null;
    return {
      id: income.id,
      name: income.name,
      amount: income.amount,
      frequency: narrowIncomeFrequency(income.frequency),
      nextPayDate: income.nextPayDate,
      isPrimary: Boolean(income.isPrimary),
    };
  }

  const prisma = getPrismaClient();
  const { budget } = await getBudgetContext();

  const income = await prisma.income.findFirst({
    where: { id, budgetId: budget.id, archivedAt: null },
  });
  if (!income) return null;

  return {
    id: income.id,
    name: income.name,
    amount: Number(income.amount),
    frequency: narrowIncomeFrequency(income.frequency),
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
  if (!hasConfiguredDatabase() || !hasSupabaseAuthConfigured()) {
    const state = await readState();
    const income = state.incomes.find((row) => row.id === input.incomeId && !row.archivedAt);
    if (!income) throw new Error("Income not found.");
    income.name = input.name.trim();
    income.amount = input.amount;
    income.frequency = input.frequency;
    income.nextPayDate = input.nextPayDate;
    await writeState(state);
    return;
  }

  const prisma = getPrismaClient();
  const { budget } = await getBudgetContext();

  const income = await prisma.income.findFirst({
    where: { id: input.incomeId, budgetId: budget.id, archivedAt: null },
  });
  if (!income) throw new Error("Income not found.");

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.effectiveFrom)) {
    throw new Error("Effective date must be YYYY-MM-DD.");
  }

  const todayIso = toIsoDate(new Date());
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
    const { budget } = await getBudgetContext();

    const target = await prisma.income.findFirst({
      where: { id: incomeId, budgetId: budget.id, archivedAt: null },
      select: { id: true },
    });
    if (!target) throw new Error("Income not found.");

    await prisma.$transaction([
      prisma.income.updateMany({
        where: { budgetId: budget.id, archivedAt: null },
        data: { isPrimary: false },
      }),
      prisma.income.update({
        where: { id: incomeId },
        data: { isPrimary: true },
      }),
    ]);
    return;
  }

  const state = await readState();
  state.primaryIncomeId = incomeId;
  state.incomes = state.incomes.map((income) => ({
    ...income,
    isPrimary: income.id === incomeId,
  }));

  for (const commitment of state.commitments) {
    if (
      commitment.fundedByIncomeId &&
      !state.incomes.some((i) => i.id === commitment.fundedByIncomeId)
    ) {
      commitment.fundedByIncomeId = incomeId;
    }
  }
  for (const goal of state.goals) {
    if (
      goal.fundedByIncomeId &&
      !state.incomes.some((i) => i.id === goal.fundedByIncomeId)
    ) {
      goal.fundedByIncomeId = incomeId;
    }
  }

  await writeState(state);
}

/** Soft-archives an income (hidden from active math; funding links move to another pay source). */
export async function archiveIncome(incomeId: string) {
  if (hasConfiguredDatabase()) {
    const prisma = getPrismaClient();
    const { budget } = await getBudgetContext();

    const income = await prisma.income.findFirst({
      where: { id: incomeId, budgetId: budget.id, archivedAt: null },
    });
    if (!income) throw new Error("Income not found.");

    const remainingCount = await prisma.income.count({
      where: { budgetId: budget.id, id: { not: incomeId }, archivedAt: null },
    });
    if (remainingCount === 0) throw new Error("You must have at least one active income.");

    const archivedAt = new Date();
    const replacement = await prisma.income.findFirst({
      where: { budgetId: budget.id, id: { not: incomeId }, archivedAt: null },
      orderBy: { createdAt: "asc" },
    });
    if (!replacement) throw new Error("You must have at least one active income.");

    await prisma.$transaction(async (tx) => {
      await tx.income.update({
        where: { id: incomeId },
        data: { archivedAt },
      });

      if (income.isPrimary) {
        await tx.income.updateMany({
          where: { budgetId: budget.id, archivedAt: null },
          data: { isPrimary: false },
        });
        await tx.income.update({
          where: { id: replacement.id },
          data: { isPrimary: true },
        });
      }

      await tx.commitment.updateMany({
        where: { budgetId: budget.id, fundedByIncomeId: incomeId },
        data: { fundedByIncomeId: replacement.id },
      });
      await tx.goal.updateMany({
        where: { budgetId: budget.id, fundedByIncomeId: incomeId },
        data: { fundedByIncomeId: replacement.id },
      });
    });

    return;
  }

  const state = await readState();
  const row = state.incomes.find((i) => i.id === incomeId);
  if (!row || row.archivedAt) throw new Error("Income not found.");

  const activeOthers = state.incomes.filter((i) => i.id !== incomeId && !i.archivedAt);
  if (activeOthers.length === 0) throw new Error("You must have at least one active income.");

  row.archivedAt = new Date().toISOString();

  if (state.primaryIncomeId === incomeId) {
    state.primaryIncomeId = activeOthers[0]!.id;
  }

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
