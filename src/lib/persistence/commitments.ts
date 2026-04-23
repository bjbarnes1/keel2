/**
 * Commitment CRUD + versioned “effective from” edits.
 *
 * Mirrors the income module: Prisma path uses append-only `CommitmentVersion` rows;
 * JSON fallback mutates `StoredCommitment` in `state.ts`. All queries are scoped by
 * `budgetId` from `getBudgetContext()`.
 *
 * @module lib/persistence/commitments
 */

import { randomUUID } from "node:crypto";

import { unstable_noStore as noStore } from "next/cache";

import { pickCommitmentVersionAt } from "@/lib/commitment-version";
import { getPrismaClient } from "@/lib/prisma";
import type { CommitmentCategory, CommitmentView } from "@/lib/types";
import { formatDisplayDate, toIsoDate } from "@/lib/utils";

import { getBudgetContext } from "./auth";
import { hasConfiguredDatabase, hasSupabaseAuthConfigured } from "./config";
import { narrowCommitmentFrequency, readState, writeState, type StoredCommitment } from "./state";

export async function getCommitmentForEdit(id: string) {
  noStore();

  if (!hasConfiguredDatabase() || !hasSupabaseAuthConfigured()) {
    const state = await readState();
    return state.commitments.find((commitment) => commitment.id === id) ?? null;
  }

  const prisma = getPrismaClient();
  const { budget } = await getBudgetContext();

  const commitment = await prisma.commitment.findFirst({
    where: { id, budgetId: budget.id },
    include: {
      categoryRef: true,
      subcategoryRef: true,
      versions: { orderBy: { effectiveFrom: "desc" } },
    },
  });
  if (!commitment) return null;

  const asOfIso = toIsoDate(new Date());
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
      where: { budgetId: budget.id, archivedAt: null },
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
  const target = state.commitments.find((c) => c.id === id && !c.archivedAt);
  if (!target) throw new Error("Commitment not found.");
  state.commitments = state.commitments.map((c) =>
    c.id === id && !c.archivedAt
      ? { ...c, ...input, category: input.categoryId as CommitmentCategory }
      : c,
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
  if (commitment.archivedAt) {
    throw new Error("Restore this commitment before saving changes.");
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.effectiveFrom)) {
    throw new Error("Effective date must be YYYY-MM-DD.");
  }

  const todayIso = toIsoDate(new Date());
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
  const commitment = state.commitments.find((row) => row.id === id && !row.archivedAt);
  if (!commitment) throw new Error("Commitment not found.");
  commitment.archivedAt = new Date().toISOString();
  await writeState(state);
}

function mapStoredCommitmentToBrowseView(row: StoredCommitment): CommitmentView {
  const nextIso = row.nextDueDate;
  return {
    id: row.id,
    name: row.name,
    amount: row.amount,
    frequency: row.frequency,
    nextDueDate: formatDisplayDate(nextIso, "short"),
    nextDueDateIso: nextIso,
    category: row.category,
    subcategory: row.subcategory,
    reserved: 0,
    perPay: 0,
    percentFunded: 0,
    fundedByIncomeId: row.fundedByIncomeId,
    isAttention: undefined,
  };
}

/**
 * Archived commitments for the browse “Archived” section (no reserve math).
 */
export async function listArchivedCommitmentsForBrowse(): Promise<CommitmentView[]> {
  noStore();

  if (!hasConfiguredDatabase() || !hasSupabaseAuthConfigured()) {
    const state = await readState();
    return state.commitments.filter((c) => Boolean(c.archivedAt)).map(mapStoredCommitmentToBrowseView);
  }

  const prisma = getPrismaClient();
  const { budget } = await getBudgetContext();
  const asOfIso = toIsoDate(new Date());

  const rows = await prisma.commitment.findMany({
    where: { budgetId: budget.id, archivedAt: { not: null } },
    orderBy: { name: "asc" },
    include: {
      categoryRef: true,
      subcategoryRef: true,
      versions: { orderBy: { effectiveFrom: "desc" } },
    },
  });

  return rows.map((commitment) => {
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
    const nextDueDate = (picked ? picked.nextDueDate : commitment.nextDueDate)
      .toISOString()
      .slice(0, 10);
    const stored: StoredCommitment = {
      id: commitment.id,
      name: picked?.name ?? commitment.name,
      amount: picked ? picked.amount : Number(commitment.amount),
      frequency: narrowCommitmentFrequency(picked?.frequency ?? commitment.frequency),
      nextDueDate,
      categoryId: picked?.categoryId ?? commitment.categoryId,
      category: commitment.categoryRef.name as CommitmentCategory,
      subcategoryId: picked?.subcategoryId ?? commitment.subcategoryId ?? undefined,
      subcategory: commitment.subcategoryRef?.name ?? undefined,
      fundedByIncomeId:
        picked?.fundedByIncomeId ?? commitment.fundedByIncomeId ?? undefined,
      archivedAt: commitment.archivedAt?.toISOString(),
    };
    return mapStoredCommitmentToBrowseView(stored);
  });
}

export async function restoreCommitment(id: string) {
  if (hasConfiguredDatabase()) {
    const prisma = getPrismaClient();
    const { budget } = await getBudgetContext();
    const result = await prisma.commitment.updateMany({
      where: { id, budgetId: budget.id, archivedAt: { not: null } },
      data: { archivedAt: null },
    });
    if (result.count === 0) throw new Error("Commitment not found or already active.");
    return;
  }

  const state = await readState();
  const commitment = state.commitments.find((row) => row.id === id && row.archivedAt);
  if (!commitment) throw new Error("Commitment not found or already active.");
  commitment.archivedAt = undefined;
  await writeState(state);
}
