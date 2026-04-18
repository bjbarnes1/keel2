import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import { extractJsonObject } from "@/lib/ai/parse-capture";
import type { CommitmentSkipInput } from "@/lib/types";

export type AskIntentKind = "answer" | "scenario_whatif" | "out_of_scope";

export type AskIntentClassification = {
  kind: AskIntentKind;
  /** Short reason for logs / debugging */
  rationale?: string;
};

/**
 * Lightweight intent routing for Ask Keel (cashflow vs hypothetical skip scenarios).
 */
export async function classifyAskIntent(
  client: Anthropic,
  message: string,
): Promise<AskIntentClassification> {
  const response = await client.messages.create({
    model: "claude-3-5-haiku-20241022",
    max_tokens: 120,
    system: `You classify a single user message about Australian household cashflow.

Return only JSON: { "kind": "answer" | "scenario_whatif" | "out_of_scope", "rationale"?: string }

Rules:
- scenario_whatif: user asks what happens if they skip a bill/goal payment, defer, miss a due date, or similar hypothetical.
- out_of_scope: not about budgeting, bills, income, goals, or Keel cashflow.
- answer: everything else in scope (including normal questions).

Examples:
- "What if I skip my rent on the 3rd?" -> scenario_whatif
- "How much do I spend on groceries?" -> answer
- "Write me a poem" -> out_of_scope`,
    messages: [{ role: "user", content: message }],
  });

  const textBlock = response.content.find((item) => item.type === "text");
  const text = textBlock?.type === "text" ? textBlock.text : "";
  const parsed = JSON.parse(extractJsonObject(text)) as { kind?: string; rationale?: string };
  const kind = parsed.kind;
  if (kind === "scenario_whatif" || kind === "out_of_scope" || kind === "answer") {
    return { kind, rationale: parsed.rationale };
  }
  return { kind: "answer" };
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const hypotheticalSkipSchema = z.object({
  kind: z.literal("commitment"),
  commitmentId: z.string().min(1),
  originalDateIso: isoDate,
  strategy: z.enum(["MAKE_UP_NEXT", "SPREAD", "MOVE_ON"]),
  spreadOverN: z.number().int().min(1).max(24).optional(),
});

/**
 * Best-effort extraction of hypothetical commitment skips from natural language.
 * Only returns skips whose `commitmentId` is in `allowedCommitmentIds`.
 */
export async function extractHypotheticalCommitmentSkips(
  client: Anthropic,
  message: string,
  allowedCommitmentIds: string[],
): Promise<CommitmentSkipInput[]> {
  if (allowedCommitmentIds.length === 0) {
    return [];
  }

  const response = await client.messages.create({
    model: "claude-3-5-haiku-20241022",
    max_tokens: 400,
    system: `You extract hypothetical "skip a bill payment" scenarios from the user message.

Return only JSON: { "hypotheticalSkips": Array<{
  "kind": "commitment",
  "commitmentId": string,
  "originalDateIso": "YYYY-MM-DD",
  "strategy": "MAKE_UP_NEXT" | "SPREAD" | "MOVE_ON",
  "spreadOverN"?: number
}> }

Rules:
- Only use commitmentId values from this allow-list: ${JSON.stringify(allowedCommitmentIds)}
- If the user does not specify a plausible skip, return hypotheticalSkips: []
- Default strategy MAKE_UP_NEXT when unclear.
- SPREAD requires spreadOverN (2–6) when strategy is SPREAD.
- Never invent commitment ids.`,
    messages: [{ role: "user", content: message }],
  });

  const textBlock = response.content.find((item) => item.type === "text");
  const text = textBlock?.type === "text" ? textBlock.text : "";
  const parsed = JSON.parse(extractJsonObject(text)) as { hypotheticalSkips?: unknown[] };
  const raw = Array.isArray(parsed.hypotheticalSkips) ? parsed.hypotheticalSkips : [];
  const out: CommitmentSkipInput[] = [];
  for (const item of raw) {
    const row = hypotheticalSkipSchema.safeParse(item);
    if (!row.success) {
      continue;
    }
    if (!allowedCommitmentIds.includes(row.data.commitmentId)) {
      continue;
    }
    if (row.data.strategy === "SPREAD" && !row.data.spreadOverN) {
      continue;
    }
    out.push({
      kind: "commitment",
      commitmentId: row.data.commitmentId,
      originalDateIso: row.data.originalDateIso,
      strategy: row.data.strategy,
      spreadOverN: row.data.strategy === "SPREAD" ? row.data.spreadOverN : undefined,
    });
  }
  return out;
}
