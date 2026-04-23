"use server";

/**
 * Layer B pattern analyser action.
 *
 * Recomputes `UserLearnedPatterns` for the authenticated user's budget by running the
 * deterministic analyser (no LLM involved). Upserts the result with the current
 * `asOf`-relative analysis window. The Ask Keel / context inspector surfaces pick up the
 * fresh data on their next read.
 *
 * Triggers: (1) the "Refresh patterns" button on `/spend/patterns`, and (2) the
 * write-side hooks in `capture.ts` could eventually queue this on a throttle, but today
 * the user triggers it explicitly so analysis cost is visible and deliberate.
 *
 * Tenancy: delegates to `getBudgetContext` — never accepts a raw `budgetId`.
 *
 * @module app/actions/patterns
 */

import { revalidatePath } from "next/cache";

import { invalidateLayerACache } from "@/lib/ai/context/generators/build-layer-a";
import { analyzePatternsForBudget } from "@/lib/ai/context/generators/analyze-patterns";
import { getBudgetContext } from "@/lib/persistence/auth";
import { hasConfiguredDatabase, hasSupabaseAuthConfigured } from "@/lib/persistence/config";
import { getPrismaClient } from "@/lib/prisma";

const ANALYSIS_LOOKBACK_MONTHS = 12;

export type RecomputePatternsResult = {
  ok: boolean;
  lastAnalyzedAt?: string;
  totalTransactionsAnalyzed?: number;
  error?: string;
};

export async function recomputePatternsAction(): Promise<RecomputePatternsResult> {
  if (!hasConfiguredDatabase() || !hasSupabaseAuthConfigured()) {
    return { ok: false, error: "Patterns require a configured database and Supabase auth." };
  }

  try {
    const { authedUser, budget } = await getBudgetContext();
    const prisma = getPrismaClient();

    const now = new Date();
    const coveringFrom = new Date(now);
    coveringFrom.setUTCMonth(coveringFrom.getUTCMonth() - ANALYSIS_LOOKBACK_MONTHS);

    const patterns = await analyzePatternsForBudget(prisma, budget.id, now);

    await prisma.userLearnedPatterns.upsert({
      where: { budgetId: budget.id },
      create: {
        budgetId: budget.id,
        lastAnalyzedAt: now,
        analysisCoveringFrom: coveringFrom,
        analysisCoveringTo: now,
        patterns,
      },
      update: {
        lastAnalyzedAt: now,
        analysisCoveringFrom: coveringFrom,
        analysisCoveringTo: now,
        patterns,
      },
    });

    // Fresh patterns could shift AI-grounded answers; drop the Layer A cache too so the
    // next Ask Keel call reads both freshly.
    invalidateLayerACache(authedUser.id);

    revalidatePath("/spend/patterns");

    return {
      ok: true,
      lastAnalyzedAt: now.toISOString(),
      totalTransactionsAnalyzed: patterns.meta.totalTransactionsAnalyzed,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[patterns] recompute failed", { error: message });
    return { ok: false, error: message };
  }
}
