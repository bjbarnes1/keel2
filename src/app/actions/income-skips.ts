"use server";

/**
 * Server Actions for {@link IncomeSkip} rows (missed / deferred pay events).
 *
 * Requires Postgres + Supabase (same guard as commitment skips). STANDALONE only.
 *
 * @module app/actions/income-skips
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getPrismaClient } from "@/lib/prisma";
import {
  getBudgetContext,
  hasConfiguredDatabase,
  hasSupabaseAuthConfigured,
} from "@/lib/persistence/keel-store";

function assertSkipsPersistence() {
  if (!hasConfiguredDatabase() || !hasSupabaseAuthConfigured()) {
    throw new Error("Income skips require a linked database and sign-in.");
  }
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const createIncomeSkipSchema = z.object({
  incomeId: z.string().min(1),
  originalDateIso: isoDate,
  notes: z.string().max(2000).optional(),
});

const revokeIncomeSkipSchema = z.object({
  skipId: z.string().min(1),
});

function revalidateIncomeSkipPaths(incomeId: string) {
  revalidatePath("/");
  revalidatePath("/timeline");
  revalidatePath("/incomes");
  revalidatePath(`/incomes/${incomeId}`);
}

export async function createIncomeSkip(input: unknown) {
  assertSkipsPersistence();
  const payload = createIncomeSkipSchema.parse(input);
  const { authedUser, budget } = await getBudgetContext();
  const prisma = getPrismaClient();

  const income = await prisma.income.findFirst({
    where: { id: payload.incomeId, budgetId: budget.id, archivedAt: null },
  });
  if (!income) {
    throw new Error("Income not found.");
  }

  const originalDate = new Date(`${payload.originalDateIso}T00:00:00.000Z`);

  await prisma.$transaction(async (tx) => {
    const existing = await tx.incomeSkip.findUnique({
      where: {
        incomeId_originalDate: {
          incomeId: payload.incomeId,
          originalDate,
        },
      },
    });

    if (existing && !existing.revokedAt) {
      throw new Error("This pay is already skipped.");
    }

    if (existing?.revokedAt) {
      await tx.incomeSkip.update({
        where: { id: existing.id },
        data: {
          revokedAt: null,
          notes: payload.notes ?? null,
          createdByUserId: authedUser.id,
        },
      });
    } else {
      await tx.incomeSkip.create({
        data: {
          budgetId: budget.id,
          incomeId: payload.incomeId,
          originalDate,
          strategy: "STANDALONE",
          notes: payload.notes ?? null,
          createdByUserId: authedUser.id,
        },
      });
    }
  });

  revalidateIncomeSkipPaths(payload.incomeId);
}

export async function revokeIncomeSkip(input: unknown) {
  assertSkipsPersistence();
  const payload = revokeIncomeSkipSchema.parse(input);
  const { budget } = await getBudgetContext();
  const prisma = getPrismaClient();

  const row = await prisma.incomeSkip.findFirst({
    where: { id: payload.skipId, budgetId: budget.id },
  });
  if (!row) {
    throw new Error("Skip not found.");
  }

  if (row.revokedAt) {
    return;
  }

  await prisma.incomeSkip.update({
    where: { id: row.id },
    data: { revokedAt: new Date() },
  });

  revalidateIncomeSkipPaths(row.incomeId);
}
