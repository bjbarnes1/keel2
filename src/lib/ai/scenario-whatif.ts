/**
 * Extracts in-memory “what if” modifications for Ask Keel scenario mode.
 *
 * One Haiku call returns optional commitment skips, income skips, a synthetic commitment
 * to add for projection only, or a goal per-pay contribution tweak. Callers merge these
 * into {@link buildTimelineForTest} inputs without persisting.
 *
 * @module lib/ai/scenario-whatif
 */

import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import { extractJsonObject } from "@/lib/ai/parse-capture";
import type { AnthropicUsageSlice } from "@/lib/ai/classify-ask";
import type { CommitmentFrequency, CommitmentSkipInput, IncomeSkipInput } from "@/lib/types";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const commitmentSkipRow = z.object({
  kind: z.literal("commitment"),
  commitmentId: z.string().min(1),
  originalDateIso: isoDate,
  strategy: z.enum(["MAKE_UP_NEXT", "SPREAD", "MOVE_ON", "STANDALONE"]),
  spreadOverN: z.number().int().min(2).max(24).optional(),
});

const incomeSkipRow = z.object({
  kind: z.literal("income"),
  incomeId: z.string().min(1),
  originalDateIso: isoDate,
  strategy: z.literal("STANDALONE"),
});

const syntheticCommitment = z.object({
  name: z.string().min(1),
  amount: z.number().finite().nonnegative(),
  frequency: z.enum(["weekly", "fortnightly", "monthly", "quarterly", "annual"]),
  nextDueDate: isoDate.nullable(),
  category: z.string().min(1),
});

const goalContributionChange = z.object({
  goalId: z.string().min(1),
  newContributionPerPay: z.number().finite().nonnegative(),
});

const responseSchema = z.object({
  commitmentSkips: z.array(commitmentSkipRow).optional(),
  incomeSkips: z.array(incomeSkipRow).optional(),
  syntheticCommitment: syntheticCommitment.nullable().optional(),
  goalContributionChange: goalContributionChange.nullable().optional(),
});

export type ScenarioWhatIfExtract = {
  commitmentSkips: CommitmentSkipInput[];
  incomeSkips: IncomeSkipInput[];
  syntheticCommitment: {
    name: string;
    amount: number;
    frequency: CommitmentFrequency;
    nextDueDate: string;
    category: string;
  } | null;
  goalContributionChange: { goalId: string; newContributionPerPay: number } | null;
};

/**
 * Parses the user message into zero or more scenario modifications, constrained by allow-lists.
 */
export async function extractScenarioWhatIfModifications(
  client: Anthropic,
  message: string,
  input: {
    allowedCommitmentIds: string[];
    allowedIncomeIds: string[];
    goals: Array<{ id: string; name: string; contributionPerPay: number }>;
  },
): Promise<{ data: ScenarioWhatIfExtract; usage?: AnthropicUsageSlice }> {
  const empty: ScenarioWhatIfExtract = {
    commitmentSkips: [],
    incomeSkips: [],
    syntheticCommitment: null,
    goalContributionChange: null,
  };

  if (
    input.allowedCommitmentIds.length === 0 &&
    input.allowedIncomeIds.length === 0 &&
    input.goals.length === 0
  ) {
    return { data: empty };
  }

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 500,
    system: `You extract hypothetical cashflow scenarios from one user message.

Return only JSON:
{
  "commitmentSkips"?: Array<{
    "kind": "commitment",
    "commitmentId": string,
    "originalDateIso": "YYYY-MM-DD",
    "strategy": "MAKE_UP_NEXT" | "SPREAD" | "MOVE_ON" | "STANDALONE",
    "spreadOverN"?: number
  }>,
  "incomeSkips"?: Array<{
    "kind": "income",
    "incomeId": string,
    "originalDateIso": "YYYY-MM-DD",
    "strategy": "STANDALONE"
  }>,
  "syntheticCommitment"?: null | {
    "name": string,
    "amount": number,
    "frequency": "weekly" | "fortnightly" | "monthly" | "quarterly" | "annual",
    "nextDueDate": "YYYY-MM-DD" | null,
    "category": string
  },
  "goalContributionChange"?: null | {
    "goalId": string,
    "newContributionPerPay": number
  }
}

Rules:
- Only commitmentId from: ${JSON.stringify(input.allowedCommitmentIds)}
- Only incomeId from: ${JSON.stringify(input.allowedIncomeIds)}
- goalId must be one of: ${JSON.stringify(input.goals.map((g) => g.id))}
- If the user asks to skip a pay/income on a date, use incomeSkips with strategy STANDALONE.
- If the user asks to add a new recurring bill, use syntheticCommitment (projection only; do not invent ids).
- If the user asks to change how much they save per pay toward a goal, use goalContributionChange.
- If nothing matches, return {} or all null/empty arrays.
- SPREAD requires spreadOverN (2–6) when strategy is SPREAD.`,
    messages: [{ role: "user", content: message }],
  });

  const textBlock = response.content.find((item) => item.type === "text");
  const text = textBlock?.type === "text" ? textBlock.text : "";
  let parsed: z.infer<typeof responseSchema>;
  try {
    parsed = responseSchema.parse(JSON.parse(extractJsonObject(text)));
  } catch {
    return { data: empty, usage: response.usage ?? undefined };
  }

  const commitmentSkips: CommitmentSkipInput[] = [];
  for (const row of parsed.commitmentSkips ?? []) {
    if (!input.allowedCommitmentIds.includes(row.commitmentId)) continue;
    if (row.strategy === "SPREAD" && !row.spreadOverN) continue;
    commitmentSkips.push({
      kind: "commitment",
      commitmentId: row.commitmentId,
      originalDateIso: row.originalDateIso,
      strategy: row.strategy,
      spreadOverN: row.strategy === "SPREAD" ? row.spreadOverN : undefined,
    });
  }

  const incomeSkips: IncomeSkipInput[] = [];
  for (const row of parsed.incomeSkips ?? []) {
    if (!input.allowedIncomeIds.includes(row.incomeId)) continue;
    incomeSkips.push({
      kind: "income",
      incomeId: row.incomeId,
      originalDateIso: row.originalDateIso,
      strategy: "STANDALONE",
    });
  }

  let synthetic: ScenarioWhatIfExtract["syntheticCommitment"] = null;
  if (parsed.syntheticCommitment) {
    const s = parsed.syntheticCommitment;
    synthetic = {
      name: s.name,
      amount: s.amount,
      frequency: s.frequency,
      nextDueDate: s.nextDueDate ?? new Date().toISOString().slice(0, 10),
      category: s.category,
    };
  }

  let goalChange: ScenarioWhatIfExtract["goalContributionChange"] = null;
  if (parsed.goalContributionChange) {
    const g = parsed.goalContributionChange;
    if (input.goals.some((x) => x.id === g.goalId)) {
      goalChange = { goalId: g.goalId, newContributionPerPay: g.newContributionPerPay };
    }
  }

  return {
    data: {
      commitmentSkips,
      incomeSkips,
      syntheticCommitment: synthetic,
      goalContributionChange: goalChange,
    },
    usage: response.usage ?? undefined,
  };
}
