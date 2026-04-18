"use server";

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
    throw new Error("Skipping payments requires a linked database and sign-in.");
  }
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const commitmentSkipCreateSchema = z.object({
  commitmentId: z.string().min(1),
  originalDateIso: isoDate,
  strategy: z.enum(["MAKE_UP_NEXT", "SPREAD", "MOVE_ON"]),
  spreadOverN: z.number().int().min(1).max(24).optional(),
  redirectTo: z.string().optional(),
  notes: z.string().max(2000).optional(),
});

const goalSkipCreateSchema = z.object({
  goalId: z.string().min(1),
  originalDateIso: isoDate,
  strategy: z.enum(["EXTEND_DATE", "REBALANCE"]),
  notes: z.string().max(2000).optional(),
});

const revokeByIdSchema = z.object({
  skipId: z.string().min(1),
});

function parseGoalRedirect(redirectTo: string | null | undefined) {
  if (!redirectTo?.startsWith("goal:")) {
    return null;
  }
  return redirectTo.slice("goal:".length);
}

function revalidateSkipPaths() {
  revalidatePath("/");
  revalidatePath("/timeline");
  revalidatePath("/bills");
  revalidatePath("/goals");
}

export async function createCommitmentSkip(input: unknown) {
  assertSkipsPersistence();
  const payload = commitmentSkipCreateSchema.parse(input);
  const { authedUser, budget } = await getBudgetContext();
  const prisma = getPrismaClient();

  const commitment = await prisma.commitment.findFirst({
    where: { id: payload.commitmentId, budgetId: budget.id, archivedAt: null },
  });
  if (!commitment) {
    throw new Error("Commitment not found.");
  }

  if (payload.strategy === "SPREAD" && !payload.spreadOverN) {
    throw new Error("spreadOverN is required for SPREAD.");
  }

  if (payload.strategy === "MOVE_ON" && !payload.redirectTo?.startsWith("goal:")) {
    throw new Error("MOVE_ON requires redirectTo goal:{id}.");
  }

  const originalDate = new Date(`${payload.originalDateIso}T00:00:00.000Z`);
  const skippedAmount = commitment.amount;

  await prisma.$transaction(async (tx) => {
    const existing = await tx.commitmentSkip.findUnique({
      where: {
        commitmentId_originalDate: {
          commitmentId: payload.commitmentId,
          originalDate,
        },
      },
    });

    if (existing && !existing.revokedAt) {
      throw new Error("This payment is already skipped.");
    }

    const goalId = parseGoalRedirect(payload.redirectTo);

    if (existing?.revokedAt) {
      await tx.commitmentSkip.update({
        where: { id: existing.id },
        data: {
          revokedAt: null,
          strategy: payload.strategy,
          spreadOverN: payload.strategy === "SPREAD" ? payload.spreadOverN ?? null : null,
          redirectTo: payload.redirectTo ?? null,
          skippedAmount,
          notes: payload.notes ?? null,
          createdByUserId: authedUser.id,
        },
      });
    } else {
      await tx.commitmentSkip.create({
        data: {
          budgetId: budget.id,
          commitmentId: payload.commitmentId,
          originalDate,
          strategy: payload.strategy,
          spreadOverN: payload.strategy === "SPREAD" ? payload.spreadOverN ?? null : null,
          redirectTo: payload.redirectTo ?? null,
          skippedAmount,
          notes: payload.notes ?? null,
          createdByUserId: authedUser.id,
        },
      });
    }

    if (payload.strategy === "MOVE_ON" && goalId) {
      const goal = await tx.goal.findFirst({ where: { id: goalId, budgetId: budget.id } });
      if (!goal) {
        throw new Error("Goal not found for redirect.");
      }
      await tx.goal.update({
        where: { id: goalId },
        data: { currentBalance: { increment: skippedAmount } },
      });
    }
  });

  revalidateSkipPaths();
}

export async function createGoalSkip(input: unknown) {
  assertSkipsPersistence();
  const payload = goalSkipCreateSchema.parse(input);
  const { authedUser, budget } = await getBudgetContext();
  const prisma = getPrismaClient();

  const goal = await prisma.goal.findFirst({
    where: { id: payload.goalId, budgetId: budget.id },
  });
  if (!goal) {
    throw new Error("Goal not found.");
  }

  const originalDate = new Date(`${payload.originalDateIso}T00:00:00.000Z`);

  await prisma.$transaction(async (tx) => {
    const existing = await tx.goalSkip.findUnique({
      where: {
        goalId_originalDate: {
          goalId: payload.goalId,
          originalDate,
        },
      },
    });

    if (existing && !existing.revokedAt) {
      throw new Error("This goal contribution is already skipped.");
    }

    if (existing?.revokedAt) {
      await tx.goalSkip.update({
        where: { id: existing.id },
        data: {
          revokedAt: null,
          strategy: payload.strategy,
          notes: payload.notes ?? null,
          createdByUserId: authedUser.id,
        },
      });
    } else {
      await tx.goalSkip.create({
        data: {
          budgetId: budget.id,
          goalId: payload.goalId,
          originalDate,
          strategy: payload.strategy,
          notes: payload.notes ?? null,
          createdByUserId: authedUser.id,
        },
      });
    }
  });

  revalidateSkipPaths();
}

export async function revokeCommitmentSkip(input: unknown) {
  assertSkipsPersistence();
  const payload = revokeByIdSchema.parse(input);
  const { budget } = await getBudgetContext();
  const prisma = getPrismaClient();

  await prisma.$transaction(async (tx) => {
    const row = await tx.commitmentSkip.findFirst({
      where: { id: payload.skipId, budgetId: budget.id, revokedAt: null },
    });
    if (!row) {
      throw new Error("Skip not found or already revoked.");
    }

    const goalId = parseGoalRedirect(row.redirectTo);

    if (row.strategy === "MOVE_ON" && goalId && row.skippedAmount != null) {
      await tx.goal.update({
        where: { id: goalId },
        data: { currentBalance: { decrement: row.skippedAmount } },
      });
    }

    await tx.commitmentSkip.update({
      where: { id: row.id },
      data: { revokedAt: new Date() },
    });
  });

  revalidateSkipPaths();
}

export async function revokeGoalSkip(input: unknown) {
  assertSkipsPersistence();
  const payload = revokeByIdSchema.parse(input);
  const { budget } = await getBudgetContext();
  const prisma = getPrismaClient();

  const row = await prisma.goalSkip.findFirst({
    where: { id: payload.skipId, budgetId: budget.id, revokedAt: null },
  });
  if (!row) {
    throw new Error("Skip not found or already revoked.");
  }

  await prisma.goalSkip.update({
    where: { id: row.id },
    data: { revokedAt: new Date() },
  });

  revalidateSkipPaths();
}
