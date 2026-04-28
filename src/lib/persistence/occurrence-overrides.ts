/**
 * Persistence helpers for per-occurrence payment-date overrides.
 *
 * Overrides are budget-scoped and keyed by `(kind, sourceId, originalDateIso)`.
 * They move one generated recurrence occurrence to a new scheduled date without
 * changing the underlying income/commitment recurrence anchor.
 *
 * @module lib/persistence/occurrence-overrides
 */

import { Prisma, OccurrenceOverrideKind as PrismaOccurrenceOverrideKind } from "@prisma/client";

import { getPrismaClient } from "@/lib/prisma";
import type { OccurrenceDateOverrideInput, OccurrenceOverrideKind } from "@/lib/types";

import { getBudgetContext } from "./auth";
import { hasConfiguredDatabase, hasSupabaseAuthConfigured } from "./config";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function toUtcDate(iso: string) {
  return new Date(`${iso}T00:00:00.000Z`);
}

function toIso(date: Date) {
  return date.toISOString().slice(0, 10);
}

function toDbKind(kind: OccurrenceOverrideKind): PrismaOccurrenceOverrideKind {
  return kind === "income" ? "INCOME" : "COMMITMENT";
}

function fromDbKind(kind: PrismaOccurrenceOverrideKind): OccurrenceOverrideKind {
  return kind === "INCOME" ? "income" : "commitment";
}

/** Preview/staging environments may not have run the latest migration yet. */
function isMissingTableError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2021";
}

function assertIsoDate(iso: string, label: string) {
  if (!ISO_DATE_RE.test(iso)) {
    throw new Error(`${label} must be YYYY-MM-DD.`);
  }
}

function assertOverridesPayload(overrides: OccurrenceDateOverrideInput[]) {
  if (overrides.length === 0) {
    throw new Error("At least one override is required.");
  }
  for (const override of overrides) {
    if (!override.sourceId?.trim()) {
      throw new Error("Override sourceId is required.");
    }
    assertIsoDate(override.originalDateIso, "originalDateIso");
    assertIsoDate(override.scheduledDateIso, "scheduledDateIso");
  }
}

export async function getActiveOccurrenceOverridesForBudget(
  budgetId: string,
): Promise<OccurrenceDateOverrideInput[]> {
  if (!hasConfiguredDatabase() || !hasSupabaseAuthConfigured()) {
    return [];
  }

  const prisma = getPrismaClient();

  let rows: Awaited<ReturnType<typeof prisma.cashflowOccurrenceOverride.findMany>>;
  try {
    rows = await prisma.cashflowOccurrenceOverride.findMany({
      where: { budgetId, revokedAt: null },
      orderBy: [{ originalDate: "asc" }, { createdAt: "asc" }],
    });
  } catch (error) {
    if (isMissingTableError(error)) {
      console.warn(
        "[getActiveOccurrenceOverridesForBudget] CashflowOccurrenceOverride table missing; returning [].",
      );
      return [];
    }
    throw error;
  }

  return rows.map((row) => ({
    overrideId: row.id,
    kind: fromDbKind(row.kind),
    sourceId: row.sourceId,
    originalDateIso: toIso(row.originalDate),
    scheduledDateIso: toIso(row.scheduledDate),
    scenarioBatchId: row.scenarioBatchId ?? undefined,
  }));
}

export async function listActiveOccurrenceOverridesForCurrentBudget() {
  if (!hasConfiguredDatabase() || !hasSupabaseAuthConfigured()) {
    return [] as OccurrenceDateOverrideInput[];
  }
  const { budget } = await getBudgetContext();
  return getActiveOccurrenceOverridesForBudget(budget.id);
}

/**
 * Persists a batch of occurrence moves for the active budget.
 *
 * If an override moves an occurrence back to its original date, the existing row
 * is soft-revoked instead of stored as a no-op override.
 */
export async function upsertOccurrenceOverrideBatch(input: {
  overrides: OccurrenceDateOverrideInput[];
  scenarioBatchId?: string;
  notes?: string;
}) {
  if (!hasConfiguredDatabase() || !hasSupabaseAuthConfigured()) {
    throw new Error("Occurrence overrides require a linked database and sign-in.");
  }

  assertOverridesPayload(input.overrides);

  const { authedUser, budget } = await getBudgetContext();
  const prisma = getPrismaClient();

  await prisma.$transaction(async (tx) => {
    for (const override of input.overrides) {
      const originalDate = toUtcDate(override.originalDateIso);
      const scheduledDate = toUtcDate(override.scheduledDateIso);
      const where = {
        budgetId: budget.id,
        kind: toDbKind(override.kind),
        sourceId: override.sourceId,
        originalDate,
      };

      const existing = await tx.cashflowOccurrenceOverride.findFirst({ where });

      // No-op target date: remove active override if present.
      if (override.originalDateIso === override.scheduledDateIso) {
        if (existing && !existing.revokedAt) {
          await tx.cashflowOccurrenceOverride.update({
            where: { id: existing.id },
            data: { revokedAt: new Date() },
          });
        }
        continue;
      }

      if (existing) {
        await tx.cashflowOccurrenceOverride.update({
          where: { id: existing.id },
          data: {
            scheduledDate,
            scenarioBatchId: input.scenarioBatchId ?? override.scenarioBatchId ?? null,
            notes: input.notes ?? null,
            revokedAt: null,
            createdByUserId: authedUser.id,
          },
        });
      } else {
        await tx.cashflowOccurrenceOverride.create({
          data: {
            budgetId: budget.id,
            kind: toDbKind(override.kind),
            sourceId: override.sourceId,
            originalDate,
            scheduledDate,
            scenarioBatchId: input.scenarioBatchId ?? override.scenarioBatchId ?? null,
            notes: input.notes ?? null,
            createdByUserId: authedUser.id,
          },
        });
      }
    }
  });
}

export async function revokeOccurrenceOverridesById(overrideIds: string[]) {
  if (!hasConfiguredDatabase() || !hasSupabaseAuthConfigured()) {
    throw new Error("Occurrence overrides require a linked database and sign-in.");
  }
  if (overrideIds.length === 0) return;

  const { budget } = await getBudgetContext();
  const prisma = getPrismaClient();

  await prisma.cashflowOccurrenceOverride.updateMany({
    where: {
      budgetId: budget.id,
      id: { in: overrideIds },
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
    },
  });
}
