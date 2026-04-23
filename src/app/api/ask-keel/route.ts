/**
 * Ask Keel HTTP API: streaming-free JSON responses for the Ask panel.
 *
 * Route Handler (Node runtime by default): authenticates via Supabase session, rate limits,
 * cost ceiling, tripwires, then runs intent classification + grounded Sonnet JSON,
 * scenario projection (`buildTimelineForTest` / skip overlays), or capture classify+parse
 * with a `capture_redirect` payload for the Capture sheet.
 *
 * **Security:** must stay in sync with middleware exemption — never assume edge middleware
 * authenticated this request.
 *
 * @module app/api/ask-keel/route
 */

import { NextResponse } from "next/server";

import { buildAskContextSnapshot, formatAskSnapshotForPrompt } from "@/lib/ai/ask-context";
import { enforceAskResponseGrounding } from "@/lib/ai/ask-grounding";
import { askResponseSchema, type AskKeelResponse } from "@/lib/ai/ask-keel-schema";
import { getAnthropicClient } from "@/lib/ai/client";
import { classifyAskIntent, extractHypotheticalCommitmentSkips } from "@/lib/ai/classify-ask";
import { classifyCaptureSentence } from "@/lib/ai/classify-capture";
import {
  extractJsonObject,
  parseAssetCapture,
  parseCommitmentCapture,
  parseIncomeCapture,
} from "@/lib/ai/parse-capture";
import {
  assertWithinAiCostCeil,
  assertWithinAiRateLimit,
  defaultAiCostCeilingCentsAud,
  trackAnthropicCompletion,
} from "@/lib/ai/rate-limit";
import { checkTripwires } from "@/lib/ai/tripwires";
import { buildTimelineForTest } from "@/lib/engine/keel";
import type { CommitmentSkipInput, SkipInput } from "@/lib/types";
import { getProjectionEngineInput } from "@/lib/persistence/keel-store";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatDisplayDate, roundMoney } from "@/lib/utils";

export type { AskKeelResponse } from "@/lib/ai/ask-keel-schema";

const HAIKU_MODEL = "claude-3-5-haiku-20241022";
const SONNET_MODEL = "claude-sonnet-4-20250514";

const quotaResponse: AskKeelResponse = {
  type: "freeform",
  headline: "You've used Ask Keel's quota for today.",
  body: "It'll refresh tomorrow.",
};

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

    const userId = data.user.id;

    await assertWithinAiRateLimit({ userId, limit: 20, windowMs: 60 * 60 * 1000 });

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

    const trip = checkTripwires(message);
    if (!trip.ok) {
      console.error("[ask-keel] tripwire", { userId, reason: trip.reason, length: message.length });
      const refusal: AskKeelResponse = {
        type: "freeform",
        headline: "Can't use that message",
        body: trip.userMessage,
      };
      return NextResponse.json({ data: refusal });
    }

    const ceiling = defaultAiCostCeilingCentsAud();
    if ((await assertWithinAiCostCeil({ userId, ceilingCentsAud: ceiling })).ok === false) {
      return NextResponse.json({ data: quotaResponse });
    }

    const intent = await classifyAskIntent(client, message);
    await trackAnthropicCompletion({ userId, model: HAIKU_MODEL, usage: intent.usage });

    if (intent.kind === "out_of_scope") {
      const dataOut: AskKeelResponse = {
        type: "freeform",
        headline: "Keel focuses on cashflow.",
        body: "Ask about income, bills, goals, or what‑if skips in your budget.",
      };
      return NextResponse.json({ data: dataOut });
    }

    if (intent.kind === "capture") {
      if ((await assertWithinAiCostCeil({ userId, ceilingCentsAud: ceiling })).ok === false) {
        return NextResponse.json({ data: quotaResponse });
      }

      const { kind } = await classifyCaptureSentence(message, { userId });

      if ((await assertWithinAiCostCeil({ userId, ceilingCentsAud: ceiling })).ok === false) {
        return NextResponse.json({ data: quotaResponse });
      }

      if (kind === "unknown") {
        const dataOut: AskKeelResponse = {
          type: "freeform",
          headline: "Couldn’t route that capture",
          body: "Describe a bill, pay, or asset more clearly, or open Capture from the menu.",
        };
        return NextResponse.json({ data: dataOut });
      }

      const cost = { userId };
      try {
        let dataOut: AskKeelResponse;
        if (kind === "commitment") {
          const payload = await parseCommitmentCapture(message, cost);
          dataOut = {
            type: "capture_redirect",
            headline: `Opening capture for ${payload.name}…`,
            sentence: message,
            capture: { kind: "commitment", payload },
          };
        } else if (kind === "income") {
          const payload = await parseIncomeCapture(message, cost);
          dataOut = {
            type: "capture_redirect",
            headline: `Opening capture for ${payload.name}…`,
            sentence: message,
            capture: { kind: "income", payload },
          };
        } else {
          const payload = await parseAssetCapture(message, cost);
          dataOut = {
            type: "capture_redirect",
            headline: `Opening capture for ${payload.name}…`,
            sentence: message,
            capture: { kind: "asset", payload },
          };
        }
        return NextResponse.json({ data: askResponseSchema.parse(dataOut) });
      } catch (err) {
        console.error("[ask-keel] capture parse", err);
        const dataOut: AskKeelResponse = {
          type: "freeform",
          headline: "Couldn’t parse that",
          body: "Edit your message or open Capture to enter details manually.",
        };
        return NextResponse.json({ data: dataOut });
      }
    }

    if (intent.kind === "scenario_whatif") {
      if ((await assertWithinAiCostCeil({ userId, ceilingCentsAud: ceiling })).ok === false) {
        return NextResponse.json({ data: quotaResponse });
      }

      const { state, activeSkips } = await getProjectionEngineInput();
      const commitmentIds = state.commitments.map((commitment) => commitment.id);
      const { skips: hypothetical, usage: hypUsage } = await extractHypotheticalCommitmentSkips(
        client,
        message,
        commitmentIds,
      );
      await trackAnthropicCompletion({ userId, model: HAIKU_MODEL, usage: hypUsage });

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
        const label = nameById.get(skip.commitmentId) ?? "Commitment";
        chips.push({
          text: `Open skip · ${label} · ${formatDisplayDate(skip.originalDateIso, "short-day")}`,
          action: `skip_commitment:${skip.commitmentId}:${skip.originalDateIso}`,
        });
      }

      const dataOut: AskKeelResponse = {
        type: "scenario_whatif",
        headline:
          hypothetical.length === 0
            ? "I couldn’t pin down a specific commitment skip."
            : "Here’s how that skip could move your 6‑week projection.",
        body:
          hypothetical.length === 0
            ? "Name the commitment and the payment date (YYYY‑MM‑DD), or open the commitment and use Skip payment."
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

    if ((await assertWithinAiCostCeil({ userId, ceilingCentsAud: ceiling })).ok === false) {
      return NextResponse.json({ data: quotaResponse });
    }

    const snapshot = await buildAskContextSnapshot();
    const snapshotPrompt = formatAskSnapshotForPrompt(snapshot);

    const response = await client.messages.create({
      model: SONNET_MODEL,
      max_tokens: 700,
      system: `${snapshotPrompt}

You are Keel's assistant for Australian household cashflow.

Return only valid JSON for one of these shapes (discriminate with "type"):
1) { "type":"goal_projection", "headline": string, "chart": { "months": string[], "todayValue": number, "targetValue": number, "targetLabel": string }, "chips"?: (string | { "text": string, "action"?: string })[] }
2) { "type":"spending_summary", "headline": string, "breakdown": { "label": string, "amount": number }[], "chips"?: (string | { "text": string, "action"?: string })[] }
3) { "type":"freeform", "headline": string, "body"?: string, "chips"?: (string | { "text": string, "action"?: string })[] , "citations"?: Array<{ "label": string, "amount"?: number, "dateIso"?: string }> }

Rules:
- Prefer structured types when the user question clearly matches.
- Use AUD thinking; amounts are numbers (not strings).
- Keep headline short; body optional and concise.
- Chips may include optional "action" for deep links (e.g. skip_commitment:id:yyyy-mm-dd).
- **Grounding:** You may only cite amounts and dates that appear in GROUNDED_SNAPSHOT_JSON. If the snapshot does not contain enough information to answer safely, return type "freeform" explaining what is missing.
- For type "goal_projection", chart.todayValue MUST equal the snapshot field "availableMoney" (${snapshot.availableMoney}).
- For type "freeform", when you mention any specific dollar amount or ISO date from the snapshot, also include a "citations" array with the matching snapshot labels/amounts/dates you relied on.`,
      messages: [{ role: "user", content: message }],
    });

    await trackAnthropicCompletion({ userId, model: SONNET_MODEL, usage: response.usage });

    const textBlock = response.content.find((item) => item.type === "text");
    const text = textBlock?.type === "text" ? textBlock.text : "";
    const parsed = JSON.parse(extractJsonObject(text));
    const parsedOut = askResponseSchema.parse(parsed);
    const grounded = enforceAskResponseGrounding(parsedOut, snapshot);

    return NextResponse.json({ data: askResponseSchema.parse(grounded) });
  } catch (error) {
    if (error instanceof Error && error.message === "RATE_LIMITED") {
      return NextResponse.json({ error: "You’ve hit the hourly Ask limit. Try again soon." }, { status: 429 });
    }

    console.error("[ask-keel] unhandled error", error);
    const fallback: AskKeelResponse = {
      type: "freeform",
      headline: "Ask is offline right now.",
    };
    return NextResponse.json({ data: fallback });
  }
}
