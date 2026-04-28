"use server";

/**
 * Server actions for timeline occurrence-date scenario confirmation.
 *
 * Validates that each moved occurrence belongs to the active budget and exists in
 * the generated recurrence window, then persists occurrence-only date overrides.
 *
 * @module app/actions/timeline-occurrence-overrides
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { invalidateLayerACache } from "@/lib/ai/context/generators/build-layer-a";
import { collectScheduledProjectionEvents } from "@/lib/engine/keel";
import {
  getBudgetContext,
  getProjectionEngineInput,
  revokeOccurrenceOverridesById,
  upsertOccurrenceOverrideBatch,
} from "@/lib/persistence/keel-store";
import type { OccurrenceDateOverrideInput } from "@/lib/types";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIMELINE_OVERRIDE_HORIZON_DAYS = 420;

const occurrenceOverrideSchema = z.object({
  kind: z.enum(["income", "commitment"]),
  sourceId: z.string().min(1),
  originalDateIso: z.string().regex(ISO_DATE_RE),
  scheduledDateIso: z.string().regex(ISO_DATE_RE),
});

const confirmTimelineOverrideSchema = z.object({
  overrides: z.array(occurrenceOverrideSchema).min(1),
  notes: z.string().max(2000).optional(),
});

const revokeTimelineOverrideSchema = z.object({
  overrideIds: z.array(z.string().min(1)).min(1),
});

function addDaysIso(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function revalidateTimelinePaths(userId?: string) {
  revalidatePath("/");
  revalidatePath("/timeline");
  revalidatePath("/cashflow");
  if (userId) invalidateLayerACache(userId);
}

function dedupeOverrides(overrides: OccurrenceDateOverrideInput[]) {
  const byKey = new Map<string, OccurrenceDateOverrideInput>();
  for (const override of overrides) {
    byKey.set(
      `${override.kind}:${override.sourceId}:${override.originalDateIso}`,
      override,
    );
  }
  return Array.from(byKey.values());
}

function assertOccurrenceOverridesValid(input: {
  overrides: OccurrenceDateOverrideInput[];
  state: Awaited<ReturnType<typeof getProjectionEngineInput>>["state"];
}) {
  const activeIncomes = input.state.incomes.filter((income) => !income.archivedAt);
  const activeCommitments = input.state.commitments.filter((commitment) => !commitment.archivedAt);
  const asOfIso = input.state.user.balanceAsOf;
  const horizonEndIso = addDaysIso(asOfIso, TIMELINE_OVERRIDE_HORIZON_DAYS);

  const scheduled = collectScheduledProjectionEvents({
    asOf: new Date(`${asOfIso}T00:00:00Z`),
    horizonDays: TIMELINE_OVERRIDE_HORIZON_DAYS,
    incomes: activeIncomes,
    commitments: activeCommitments,
  });
  const validOccurrenceKeys = new Set(
    scheduled.flatMap((event) => {
      if (!event.sourceKind || !event.sourceId) return [];
      const originalDateIso = event.originalDateIso ?? event.date;
      const kind = event.sourceKind;
      return [`${kind}:${event.sourceId}:${originalDateIso}`];
    }),
  );

  const activeIncomeIds = new Set(activeIncomes.map((income) => income.id));
  const activeCommitmentIds = new Set(activeCommitments.map((commitment) => commitment.id));

  for (const override of input.overrides) {
    if (override.kind === "income" && !activeIncomeIds.has(override.sourceId)) {
      throw new Error(`Income ${override.sourceId} was not found in your active schedule.`);
    }
    if (override.kind === "commitment" && !activeCommitmentIds.has(override.sourceId)) {
      throw new Error(`Commitment ${override.sourceId} was not found in your active schedule.`);
    }
    const key = `${override.kind}:${override.sourceId}:${override.originalDateIso}`;
    if (!validOccurrenceKeys.has(key)) {
      throw new Error(
        `Occurrence ${override.sourceId} on ${override.originalDateIso} is outside the loaded recurrence window.`,
      );
    }
    if (override.scheduledDateIso < asOfIso || override.scheduledDateIso > horizonEndIso) {
      throw new Error(
        `Scheduled date ${override.scheduledDateIso} is outside the supported timeline horizon.`,
      );
    }
  }
}

/**
 * Persists a batch of draft timeline moves as occurrence-only date overrides.
 */
export async function confirmTimelineOccurrenceOverrides(input: unknown) {
  const payload = confirmTimelineOverrideSchema.parse(input);
  const { authedUser } = await getBudgetContext();
  const { state } = await getProjectionEngineInput();

  const overrides = dedupeOverrides(payload.overrides);
  assertOccurrenceOverridesValid({ overrides, state });

  const scenarioBatchId = `timeline-${new Date().toISOString()}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;

  await upsertOccurrenceOverrideBatch({
    overrides,
    scenarioBatchId,
    notes: payload.notes,
  });

  revalidateTimelinePaths(authedUser?.id);
  return { scenarioBatchId, saved: overrides.length };
}

/**
 * Soft-revokes persisted occurrence overrides by id for the active budget.
 */
export async function revokeTimelineOccurrenceOverrides(input: unknown) {
  const payload = revokeTimelineOverrideSchema.parse(input);
  const { authedUser } = await getBudgetContext();
  await revokeOccurrenceOverridesById(payload.overrideIds);
  revalidateTimelinePaths(authedUser?.id);
}
