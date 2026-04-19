import { NextResponse } from "next/server";
import { z } from "zod";

import { getAnthropicClient } from "@/lib/ai/client";
import { classifyAskIntent, extractHypotheticalCommitmentSkips } from "@/lib/ai/classify-ask";
import { extractJsonObject } from "@/lib/ai/parse-capture";
import { assertWithinAiRateLimit } from "@/lib/ai/rate-limit";
import { buildTimelineForTest } from "@/lib/engine/keel";
import type { CommitmentSkipInput, SkipInput } from "@/lib/types";
import { getProjectionEngineInput } from "@/lib/persistence/keel-store";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const chipSchema = z.union([
  z.string(),
  z.object({
    text: z.string().min(1),
    action: z.string().optional(),
  }),
]);

const askResponseSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("goal_projection"),
    headline: z.string().min(1),
    chart: z.object({
      months: z.array(z.string()).min(1),
      todayValue: z.number().finite(),
      targetValue: z.number().finite(),
      targetLabel: z.string().min(1),
    }),
    chips: z.array(chipSchema).optional(),
  }),
  z.object({
    type: z.literal("spending_summary"),
    headline: z.string().min(1),
    breakdown: z.array(z.object({ label: z.string().min(1), amount: z.number().finite() })).min(1),
    chips: z.array(chipSchema).optional(),
  }),
  z.object({
    type: z.literal("scenario_whatif"),
    headline: z.string().min(1),
    body: z.string().optional(),
    hypotheticalSkips: z
      .array(
        z.object({
          kind: z.literal("commitment"),
          commitmentId: z.string(),
          originalDateIso: z.string(),
          strategy: z.enum(["MAKE_UP_NEXT", "SPREAD", "MOVE_ON"]),
          spreadOverN: z.number().optional(),
        }),
      )
      .optional(),
    deltas: z.object({
      endProjectedAvailableMoney: z.number().finite(),
      endAvailableMoneyDelta: z.number().finite(),
    }),
    chips: z.array(chipSchema).optional(),
  }),
  z.object({
    type: z.literal("freeform"),
    headline: z.string().min(1),
    body: z.string().optional(),
    chips: z.array(chipSchema).optional(),
  }),
]);

export type AskKeelResponse = z.infer<typeof askResponseSchema>;

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.getUser();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    if (!data.user) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    await assertWithinAiRateLimit({ userId: data.user.id, limit: 20, windowMs: 60 * 60 * 1000 });

    const body = (await request.json()) as { message?: string };
    const message = String(body.message ?? "").trim();
    if (!message) {
      return NextResponse.json({ error: "Message is required." }, { status: 400 });
    }

    if (process.env.KEEL_AI_ENABLED !== "true") {
      const fallback: AskKeelResponse = {
        type: "freeform",
        headline: "Ask is offline right now.",
        body: "Keel AI is disabled for this environment.",
      };
      return NextResponse.json({ data: fallback });
    }

    const client = getAnthropicClient();
    if (!client) {
      const fallback: AskKeelResponse = {
        type: "freeform",
        headline: "Ask is offline right now.",
        body: "Anthropic is not configured.",
      };
      return NextResponse.json({ data: fallback });
    }

    const intent = await classifyAskIntent(client, message);

    if (intent.kind === "out_of_scope") {
      const dataOut: AskKeelResponse = {
        type: "freeform",
        headline: "Keel focuses on cashflow.",
        body: "Ask about income, bills, goals, or what‑if skips in your budget.",
      };
      return NextResponse.json({ data: dataOut });
    }

    if (intent.kind === "scenario_whatif") {
      const { state, activeSkips } = await getProjectionEngineInput();
      const commitmentIds = state.commitments.map((commitment) => commitment.id);
      const hypothetical = await extractHypotheticalCommitmentSkips(client, message, commitmentIds);

      const incomes = state.incomes.map((income) => ({
        id: income.id,
        name: income.name,
        amount: income.amount,
        frequency: income.frequency,
        nextPayDate: income.nextPayDate,
      }));
      const commitments = state.commitments.map((commitment) => ({
        id: commitment.id,
        name: commitment.name,
        amount: commitment.amount,
        frequency: commitment.frequency,
        nextDueDate: commitment.nextDueDate,
        fundedByIncomeId: commitment.fundedByIncomeId,
        category: commitment.category,
      }));
      const goals = state.goals.map((goal) => ({
        id: goal.id,
        name: goal.name,
        contributionPerPay: goal.contributionPerPay,
        fundedByIncomeId: goal.fundedByIncomeId,
        currentBalance: goal.currentBalance,
        targetAmount: goal.targetAmount,
        targetDate: goal.targetDate,
      }));

      const persisted: SkipInput[] = [...activeSkips.commitmentSkips, ...activeSkips.goalSkips];
      const combined: SkipInput[] = [...persisted, ...hypothetical];

      const baseTimeline = buildTimelineForTest({
        asOfIso: state.user.balanceAsOf,
        bankBalance: state.user.bankBalance,
        incomes,
        primaryIncomeId: state.primaryIncomeId,
        commitments,
        goals,
        skips: persisted,
        horizonDays: 42,
      });
      const hypTimeline = buildTimelineForTest({
        asOfIso: state.user.balanceAsOf,
        bankBalance: state.user.bankBalance,
        incomes,
        primaryIncomeId: state.primaryIncomeId,
        commitments,
        goals,
        skips: combined,
        horizonDays: 42,
      });

      const endBase =
        baseTimeline.length > 0
          ? baseTimeline[baseTimeline.length - 1]!.projectedAvailableMoney
          : state.user.bankBalance;
      const endHyp =
        hypTimeline.length > 0
          ? hypTimeline[hypTimeline.length - 1]!.projectedAvailableMoney
          : state.user.bankBalance;
      const delta = roundMoney(endHyp - endBase);

      const nameById = new Map(state.commitments.map((commitment) => [commitment.id, commitment.name]));
      const chips: Array<string | { text: string; action?: string }> = [];
      for (const skip of hypothetical) {
        const label = nameById.get(skip.commitmentId) ?? "Bill";
        chips.push({
          text: `Open skip · ${label} · ${skip.originalDateIso}`,
          action: `skip_commitment:${skip.commitmentId}:${skip.originalDateIso}`,
        });
      }

      const dataOut: AskKeelResponse = {
        type: "scenario_whatif",
        headline:
          hypothetical.length === 0
            ? "I couldn’t pin down a specific bill skip."
            : "Here’s how that skip could move your 6‑week projection.",
        body:
          hypothetical.length === 0
            ? "Name the bill and the payment date (YYYY‑MM‑DD), or pick a bill from Bills and use Skip payment."
            : `Projected available at end of horizon: ${roundMoney(endHyp)} (delta ${delta >= 0 ? "+" : ""}${delta} vs your current plan).`,
        hypotheticalSkips: hypothetical as CommitmentSkipInput[],
        deltas: {
          endProjectedAvailableMoney: roundMoney(endHyp),
          endAvailableMoneyDelta: delta,
        },
        chips: chips.length ? chips : undefined,
      };

      return NextResponse.json({ data: askResponseSchema.parse(dataOut) });
    }

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 700,
      system: `You are Keel's assistant for Australian household cashflow.

Return only valid JSON for one of these shapes (discriminate with "type"):
1) { "type":"goal_projection", "headline": string, "chart": { "months": string[], "todayValue": number, "targetValue": number, "targetLabel": string }, "chips"?: (string | { "text": string, "action"?: string })[] }
2) { "type":"spending_summary", "headline": string, "breakdown": { "label": string, "amount": number }[], "chips"?: (string | { "text": string, "action"?: string })[] }
3) { "type":"freeform", "headline": string, "body"?: string, "chips"?: (string | { "text": string, "action"?: string })[] }

Rules:
- Prefer structured types when the user question clearly matches
- Use AUD thinking; amounts are numbers (not strings)
- Keep headline short; body optional and concise
- Chips may include optional "action" for deep links (e.g. skip_commitment:id:yyyy-mm-dd)`,
      messages: [{ role: "user", content: message }],
    });

    const textBlock = response.content.find((item) => item.type === "text");
    const text = textBlock?.type === "text" ? textBlock.text : "";
    const parsed = JSON.parse(extractJsonObject(text));
    const dataOut = askResponseSchema.parse(parsed);

    return NextResponse.json({ data: dataOut });
  } catch (error) {
    if (error instanceof Error && error.message === "RATE_LIMITED") {
      return NextResponse.json({ error: "You’ve hit the hourly Ask limit. Try again soon." }, { status: 429 });
    }

    const fallback: AskKeelResponse = {
      type: "freeform",
      headline: "Ask is offline right now.",
    };
    return NextResponse.json({ data: fallback });
  }
}
