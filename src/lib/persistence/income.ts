import { randomUUID } from "node:crypto";

import { unstable_noStore as noStore } from "next/cache";

import { getPrismaClient } from "@/lib/prisma";
import { toIsoDate } from "@/lib/utils";

import { getBudgetContext } from "./auth";
import { hasConfiguredDatabase, hasSupabaseAuthConfigured } from "./config";
import { readState, writeState, type StoredIncome } from "./state";

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

  if (!hasConfiguredDatabase() || !hasSupabaseAuthConfigured()) return null;

  const prisma = getPrismaClient();
  const { budget } = await getBudgetContext();

  const income = await prisma.income.findFirst({
    where: { id, budgetId: budget.id },
  });
  if (!income) return null;

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
      where: { id: incomeId, budgetId: budget.id },
      select: { id: true },
    });
    if (!target) throw new Error("Income not found.");

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

export async function deleteIncome(incomeId: string) {
  if (hasConfiguredDatabase()) {
    const prisma = getPrismaClient();
    const { budget } = await getBudgetContext();

    const incomes = await prisma.income.findMany({
      where: { budgetId: budget.id },
      orderBy: { createdAt: "asc" },
    });

    if (!incomes.some((i) => i.id === incomeId)) {
      throw new Error("Income not found.");
    }

    const remaining = incomes.filter((income) => income.id !== incomeId);
    if (remaining.length === 0) {
      throw new Error("You must have at least one income.");
    }

    await prisma.income.delete({ where: { id: incomeId } });

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
