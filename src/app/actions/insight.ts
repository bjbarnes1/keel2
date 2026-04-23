"use server";

/**
 * Server action: generate (or refresh) the proactive AI insight for the current user's
 * budget. Calls Haiku with the three-layer context and upserts the result into
 * `UserAiInsight`. Gated on `KEEL_AI_ENABLED` and the per-user rate limit.
 *
 * @module app/actions/insight
 */

import { revalidatePath } from "next/cache";

import { generateAiInsight } from "@/lib/ai/generate-insight";
import { assertWithinAiRateLimit, assertWithinAiCostCeil, defaultAiCostCeilingCentsAud } from "@/lib/ai/rate-limit";
import { getBudgetContext } from "@/lib/persistence/auth";
import { hasConfiguredDatabase, hasSupabaseAuthConfigured } from "@/lib/persistence/config";
import { getPrismaClient } from "@/lib/prisma";

export type GenerateInsightResult = {
  ok: boolean;
  headline?: string;
  body?: string;
  error?: string;
};

export async function generateInsightAction(): Promise<GenerateInsightResult> {
  if (!hasConfiguredDatabase() || !hasSupabaseAuthConfigured()) {
    return { ok: false, error: "Insight requires a configured database and auth." };
  }

  if (process.env.KEEL_AI_ENABLED !== "true") {
    return { ok: false, error: "AI is not enabled." };
  }

  try {
    const { authedUser, budget } = await getBudgetContext();
    const userId = authedUser.id;

    await assertWithinAiRateLimit({ userId, limit: 20, windowMs: 60 * 60 * 1000 });

    const ceiling = defaultAiCostCeilingCentsAud();
    const withinCeil = await assertWithinAiCostCeil({ userId, ceilingCentsAud: ceiling });
    if (!withinCeil.ok) {
      return { ok: false, error: "Daily AI spend limit reached. Try again tomorrow." };
    }

    const insight = await generateAiInsight(userId);
    if (!insight) {
      return { ok: false, error: "Could not generate an insight right now." };
    }

    const prisma = getPrismaClient();
    const now = new Date();

    await prisma.userAiInsight.upsert({
      where: { budgetId: budget.id },
      create: {
        budgetId: budget.id,
        headline: insight.headline,
        body: insight.body || null,
        generatedAt: now,
      },
      update: {
        headline: insight.headline,
        body: insight.body || null,
        generatedAt: now,
      },
    });

    revalidatePath("/");

    return { ok: true, headline: insight.headline, body: insight.body };
  } catch (err) {
    if (err instanceof Error && err.message === "RATE_LIMITED") {
      return { ok: false, error: "You've hit the hourly limit. Try again soon." };
    }
    const message = err instanceof Error ? err.message : String(err);
    console.error("[insight] generate failed", { error: message });
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}
