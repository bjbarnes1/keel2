/**
 * Persistence helpers for the proactive AI insight card.
 *
 * One row per budget (upserted by the `generateInsightAction` server action).
 * Reads are soft-staleness-gated: insights older than 24 hours are treated as absent
 * so the UI invites the user to regenerate without hard-deleting old data.
 *
 * @module lib/persistence/ai-insight
 */

import { getBudgetContext } from "@/lib/persistence/auth";
import { hasConfiguredDatabase, hasSupabaseAuthConfigured } from "@/lib/persistence/config";
import { getPrismaClient } from "@/lib/prisma";

const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

export type StoredAiInsight = {
  headline: string;
  body: string | null;
  generatedAt: Date;
};

/**
 * Returns the budget's latest AI insight, or `null` when:
 * - the database is not configured
 * - no insight has been generated yet
 * - the stored insight is older than 24 hours (stale)
 */
export async function getLatestAiInsight(): Promise<StoredAiInsight | null> {
  if (!hasConfiguredDatabase() || !hasSupabaseAuthConfigured()) return null;

  try {
    const { budget } = await getBudgetContext();
    const prisma = getPrismaClient();

    const row = await prisma.userAiInsight.findUnique({
      where: { budgetId: budget.id },
      select: { headline: true, body: true, generatedAt: true },
    });

    if (!row) return null;

    if (Date.now() - row.generatedAt.getTime() > STALE_AFTER_MS) return null;

    return { headline: row.headline, body: row.body, generatedAt: row.generatedAt };
  } catch {
    return null;
  }
}
