import { randomUUID } from "node:crypto";

import { unstable_noStore as noStore } from "next/cache";

import { pickCommitmentVersionAt } from "@/lib/commitment-version";
import { getPrismaClient } from "@/lib/prisma";
import type { CommitmentCategory } from "@/lib/types";

import { getBudgetContext } from "./auth";
import { hasConfiguredDatabase, hasSupabaseAuthConfigured } from "./config";
import { readState, writeState, type StoredCommitment } from "./state";

export async function getCommitmentForEdit(id: string) {
  noStore();

  if (!hasConfiguredDatabase() || !hasSupabaseAuthConfigured()) {
    const state = await readState();
    return state.commitments.find((commitment) => commitment.id === id) ?? null;
  }

  const prisma = getPrismaClient();
  const { budget } = await getBudgetContext();

  const commitment = await prisma.commitment.findFirst({
    where: { id, budgetId: budget.id, archivedAt: null },
    include: {
      categoryRef: true,
      subcategoryRef: true,
      versions: { orderBy: { effectiveFrom: "desc" } },
    },
  });
  if (!commitment) return null;

  const asOfIso = new Date().toISOString().slice(0, 10);
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

  const result: StoredCommitment = {
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
  return result;
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
    const { budget } = await getBudgetContext();

    const incomes = await prisma.income.findMany({
      where: { budgetId: budget.id },
      orderBy: { createdAt: "asc" },
    });
    if (incomes.length === 0) {
      throw new Error("No income found to create a commitment.");
    }

    const primaryIncomeId =
      incomes.find((i) => i.isPrimary)?.id ?? incomes[0]!.id;

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
    category: input.categoryId as CommitmentCategory,
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
    const { budget } = await getBudgetContext();

    const existing = await prisma.commitment.findFirst({
      where: { id, budgetId: budget.id, archivedAt: null },
    });
    if (!existing) throw new Error("Commitment not found.");

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
  state.commitments = state.commitments.map((c) =>
    c.id === id ? { ...c, ...input, category: input.categoryId as CommitmentCategory } : c,
  );
  await writeState(state);
}

export async function updateCommitmentFuture(
  id: string,
  input: {
    effectiveFrom: string;
    name: string;
    amount: number;
    frequency: StoredCommitment["frequency"];
    nextDueDate: string;
    categoryId: string;
    subcategoryId?: string;
    fundedByIncomeId?: string;
  },
) {
  if (!hasConfiguredDatabase()) {
    await updateCommitment(id, {
      name: input.name,
      amount: input.amount,
      frequency: input.frequency,
      nextDueDate: input.nextDueDate,
      categoryId: input.categoryId,
      subcategoryId: input.subcategoryId,
      fundedByIncomeId: input.fundedByIncomeId,
    });
    return;
  }

  const prisma = getPrismaClient();
  const { budget } = await getBudgetContext();

  const commitment = await prisma.commitment.findFirst({
    where: { id, budgetId: budget.id },
  });
  if (!commitment) throw new Error("Commitment not found.");

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.effectiveFrom)) {
    throw new Error("Effective date must be YYYY-MM-DD.");
  }

  const todayIso = new Date().toISOString().slice(0, 10);
  if (input.effectiveFrom < todayIso) {
    throw new Error("Changes can only apply from today onward.");
  }

  const effectiveDate = new Date(`${input.effectiveFrom}T00:00:00Z`);
  const nextDueDate = new Date(`${input.nextDueDate}T00:00:00Z`);

  const dayBefore = new Date(effectiveDate);
  dayBefore.setUTCDate(dayBefore.getUTCDate() - 1);
  const dayBeforeIso = dayBefore.toISOString().slice(0, 10);

  await prisma.$transaction(async (tx) => {
    const open = await tx.commitmentVersion.findFirst({
      where: { commitmentId: id, effectiveTo: null },
    });
    if (open) {
      await tx.commitmentVersion.update({
        where: { id: open.id },
        data: { effectiveTo: new Date(`${dayBeforeIso}T00:00:00Z`) },
      });
    }

    await tx.commitmentVersion.create({
      data: {
        commitmentId: id,
        effectiveFrom: effectiveDate,
        effectiveTo: null,
        name: input.name.trim(),
        amount: input.amount,
        frequency: input.frequency,
        nextDueDate,
        categoryId: input.categoryId,
        subcategoryId: input.subcategoryId ?? null,
        fundedByIncomeId: input.fundedByIncomeId ?? null,
      },
    });

    await tx.commitment.update({
      where: { id },
      data: {
        name: input.name.trim(),
        amount: input.amount,
        frequency: input.frequency,
        nextDueDate,
        categoryId: input.categoryId,
        subcategoryId: input.subcategoryId ?? null,
        fundedByIncomeId: input.fundedByIncomeId,
      },
    });
  });
}

export async function deleteCommitment(id: string) {
  if (hasConfiguredDatabase()) {
    const prisma = getPrismaClient();
    const { budget } = await getBudgetContext();

    const archivedAt = new Date();
    const result = await prisma.commitment.updateMany({
      where: { id, budgetId: budget.id, archivedAt: null },
      data: { archivedAt },
    });
    if (result.count === 0) throw new Error("Commitment not found.");
    return;
  }

  const state = await readState();
  const commitment = state.commitments.find((row) => row.id === id);
  if (!commitment) throw new Error("Commitment not found.");
  commitment.archivedAt = new Date().toISOString();
  await writeState(state);
}
