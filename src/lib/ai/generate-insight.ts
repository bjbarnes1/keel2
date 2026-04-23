/**
 * Proactive AI insight generator.
 *
 * Calls Haiku with the composed three-layer context and a fixed proactive prompt to
 * produce a single headline + body insight ("the most important thing you should know
 * about your finances right now"). Uses prompt caching: the stable instruction block +
 * Layer C is cached; only the per-user Layer A + B is re-sent each call.
 *
 * Returns `null` if AI is disabled or an error occurs — callers handle gracefully.
 *
 * @module lib/ai/generate-insight
 */

import type Anthropic from "@anthropic-ai/sdk";

import { getAnthropicClient } from "@/lib/ai/client";
import { composeAskContext } from "@/lib/ai/context/generators/compose-context";
import {
  renderStableLayeredPrompt,
  renderVolatileLayeredPrompt,
} from "@/lib/ai/context/render-prompt";
import { extractJsonObject } from "@/lib/ai/parse-capture";

const INSIGHT_MODEL = "claude-haiku-4-5-20251001";

const INSIGHT_SYSTEM_STABLE = `You are Keel, a personal finance assistant for Australian households.

Given the user's current financial context, identify the single most important thing they should know right now. Prioritise in this order:
1. Shortfalls — projected available money going negative within 60 days
2. Large upcoming bills in the next 14 days they may be underprepared for
3. Goals significantly behind or ahead of schedule
4. Cashflow patterns worth attention (e.g. consistent overspend in a category)

Return only valid JSON: { "headline": string, "body": string }
- headline: ≤ 80 characters. Direct, specific, no greeting.
- body: 1–2 sentences max. Actionable and grounded in their actual numbers.
- If everything looks healthy: { "headline": "You're on track", "body": "No shortfalls in the next 60 days and all goals are progressing." }`;

export type InsightResult = { headline: string; body: string };

/**
 * Generates a proactive financial insight for the given user.
 *
 * @param userId Supabase user id — used as the Layer A cache key; tenancy is enforced
 *               inside `composeAskContext`.
 * @returns `{ headline, body }` or `null` when AI is unavailable or the call fails.
 */
export async function generateAiInsight(userId: string): Promise<InsightResult | null> {
  if (process.env.KEEL_AI_ENABLED !== "true") return null;

  const client = getAnthropicClient();
  if (!client) return null;

  try {
    const context = await composeAskContext(userId);

    const systemBlocks: Anthropic.TextBlockParam[] = [
      {
        type: "text",
        text: `${INSIGHT_SYSTEM_STABLE}\n\n${renderStableLayeredPrompt(context)}`,
        cache_control: { type: "ephemeral" },
      },
      {
        type: "text",
        text: renderVolatileLayeredPrompt(context),
      },
    ];

    const response = await client.messages.create({
      model: INSIGHT_MODEL,
      max_tokens: 300,
      system: systemBlocks,
      messages: [
        {
          role: "user",
          content:
            "What is the single most important thing I should know about my finances right now?",
        },
      ],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    const text = textBlock?.type === "text" ? textBlock.text : "";

    const raw = JSON.parse(extractJsonObject(text)) as { headline?: unknown; body?: unknown };

    if (typeof raw.headline !== "string" || !raw.headline.trim()) return null;

    return {
      headline: raw.headline.trim().slice(0, 120),
      body: typeof raw.body === "string" ? raw.body.trim().slice(0, 600) : "",
    };
  } catch (err) {
    console.error("[generate-insight] failed", err instanceof Error ? err.message : String(err));
    return null;
  }
}
