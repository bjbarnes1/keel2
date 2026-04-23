/**
 * Ask Keel HTTP API: JSON responses and optional NDJSON streaming for quick answers.
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

import { buildAskSonnetAnswerSystemPrompt } from "@/lib/ai/ask-answer-prompt";
import { buildAskContextSnapshot } from "@/lib/ai/ask-context";
import { validateFreeformCitations } from "@/lib/ai/ask-citations";
import { enforceAskResponseGrounding } from "@/lib/ai/ask-grounding";
import { askResponseSchema, type AskKeelResponse } from "@/lib/ai/ask-keel-schema";
import { createStreamingAskResponse } from "@/lib/ai/ask-stream";
import { getAnthropicClient } from "@/lib/ai/client";
import { classifyAskIntent } from "@/lib/ai/classify-ask";
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
import { extractScenarioWhatIfModifications } from "@/lib/ai/scenario-whatif";
import type { CommitmentSkipInput, IncomeSkipInput, SkipInput } from "@/lib/types";
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

    const body = (await request.json()) as { message?: string; stream?: boolean };
    const message = String(body.message ?? "").trim();
    const wantsStream = body.stream === true;
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

    if (wantsStream) {
      return createStreamingAskResponse({ client, userId, message });
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
      const commitmentIds = state.commitments.filter((c) => !c.archivedAt).map((c) => c.id);
      const incomeIds = state.incomes.filter((i) => !i.archivedAt).map((i) => i.id);
      const goalBrief = state.goals.map((g) => ({
        id: g.id,
        name: g.name,
        contributionPerPay: g.contributionPerPay,
      }));

      const { data: scenarioMods, usage: hypUsage } = await extractScenarioWhatIfModifications(client, message, {
        allowedCommitmentIds: commitmentIds,
        allowedIncomeIds: incomeIds,
        goals: goalBrief,
      });
      await trackAnthropicCompletion({ userId, model: HAIKU_MODEL, usage: hypUsage });

      const incomes = state.incomes
        .filter((income) => !income.archivedAt)
        .map((income) => ({
          id: income.id,
          name: income.name,
          amount: income.amount,
          frequency: income.frequency,
          nextPayDate: income.nextPayDate,
        }));
      const commitmentsBase = state.commitments
        .filter((c) => !c.archivedAt)
        .map((commitment) => ({
          id: commitment.id,
          name: commitment.name,
          amount: commitment.amount,
          frequency: commitment.frequency,
          nextDueDate: commitment.nextDueDate,
          fundedByIncomeId: commitment.fundedByIncomeId,
          category: commitment.category,
        }));
      let commitments = commitmentsBase.slice();
      const SYN = "__ask_scenario_commitment__";
      if (scenarioMods.syntheticCommitment) {
        const s = scenarioMods.syntheticCommitment;
        commitments = [
          ...commitments,
          {
            id: SYN,
            name: s.name,
            amount: s.amount,
            frequency: s.frequency,
            nextDueDate: s.nextDueDate,
            fundedByIncomeId: state.primaryIncomeId,
            category: s.category,
          },
        ];
      }

      let goals = state.goals.map((goal) => ({
        id: goal.id,
        name: goal.name,
        contributionPerPay: goal.contributionPerPay,
        fundedByIncomeId: goal.fundedByIncomeId,
        currentBalance: goal.currentBalance,
        targetAmount: goal.targetAmount,
        targetDate: goal.targetDate,
      }));
      if (scenarioMods.goalContributionChange) {
        const ch = scenarioMods.goalContributionChange;
        goals = goals.map((g) =>
          g.id === ch.goalId ? { ...g, contributionPerPay: ch.newContributionPerPay } : g,
        );
      }

      const persisted: SkipInput[] = [
        ...activeSkips.commitmentSkips,
        ...activeSkips.goalSkips,
        ...activeSkips.incomeSkips,
      ];
      const hypotheticalCommitment = scenarioMods.commitmentSkips;
      const hypotheticalIncome = scenarioMods.incomeSkips;
      const combined: SkipInput[] = [...persisted, ...hypotheticalCommitment, ...hypotheticalIncome];

      const goalsBaseline = state.goals.map((goal) => ({
        id: goal.id,
        name: goal.name,
        contributionPerPay: goal.contributionPerPay,
        fundedByIncomeId: goal.fundedByIncomeId,
        currentBalance: goal.currentBalance,
        targetAmount: goal.targetAmount,
        targetDate: goal.targetDate,
      }));

      const baseTimeline = buildTimelineForTest({
        asOfIso: state.user.balanceAsOf,
        bankBalance: state.user.bankBalance,
        incomes,
        primaryIncomeId: state.primaryIncomeId,
        commitments: commitmentsBase,
        goals: goalsBaseline,
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
      const incomeNameById = new Map(state.incomes.map((income) => [income.id, income.name]));
      const chips: Array<string | { text: string; action?: string }> = [];
      for (const skip of hypotheticalCommitment) {
        const label = nameById.get(skip.commitmentId) ?? "Commitment";
        chips.push({
          text: `Open skip · ${label} · ${formatDisplayDate(skip.originalDateIso, "short-day")}`,
          action: `skip_commitment:${skip.commitmentId}:${skip.originalDateIso}`,
        });
      }
      for (const skip of hypotheticalIncome) {
        const label = incomeNameById.get(skip.incomeId) ?? "Income";
        chips.push({
          text: `Open income · ${label} · ${formatDisplayDate(skip.originalDateIso, "short-day")}`,
          action: `skip_income:${skip.incomeId}:${skip.originalDateIso}`,
        });
      }

      const hasScenario =
        hypotheticalCommitment.length > 0 ||
        hypotheticalIncome.length > 0 ||
        Boolean(scenarioMods.syntheticCommitment) ||
        Boolean(scenarioMods.goalContributionChange);

      const detailLines: string[] = [];
      detailLines.push(`Baseline end (6 weeks): ${roundMoney(endBase)}`);
      detailLines.push(`Scenario end (6 weeks): ${roundMoney(endHyp)}`);
      detailLines.push(`Delta: ${delta >= 0 ? "+" : ""}${delta}`);

      const dataOut: AskKeelResponse = {
        type: "scenario_whatif",
        headline: hasScenario
          ? "Here’s how that scenario could move your 6‑week projection."
          : "I couldn’t pin down a specific change.",
        body: hasScenario
          ? `${detailLines.join("\n")}\n\nTap a chip to open the right screen when it’s a skip.`
          : "Name the commitment or income and the date (YYYY‑MM‑DD), add a bit more detail, or adjust from Timeline.",
        hypotheticalSkips: hypotheticalCommitment.length ? (hypotheticalCommitment as CommitmentSkipInput[]) : undefined,
        hypotheticalIncomeSkips: hypotheticalIncome.length ? (hypotheticalIncome as IncomeSkipInput[]) : undefined,
        deltas: {
          endProjectedAvailableMoney: roundMoney(endHyp),
          endAvailableMoneyDelta: delta,
          baselineEndProjectedAvailableMoney: roundMoney(endBase),
        },
        chips: chips.length ? chips : undefined,
      };

      return NextResponse.json({ data: askResponseSchema.parse(dataOut) });
    }

    if ((await assertWithinAiCostCeil({ userId, ceilingCentsAud: ceiling })).ok === false) {
      return NextResponse.json({ data: quotaResponse });
    }

    const snapshot = await buildAskContextSnapshot({ userId });

    const response = await client.messages.create({
      model: SONNET_MODEL,
      max_tokens: 700,
      system: buildAskSonnetAnswerSystemPrompt(snapshot),
      messages: [{ role: "user", content: message }],
    });

    await trackAnthropicCompletion({ userId, model: SONNET_MODEL, usage: response.usage });

    const textBlock = response.content.find((item) => item.type === "text");
    const text = textBlock?.type === "text" ? textBlock.text : "";
    const parsed = JSON.parse(extractJsonObject(text));
    const parsedOut = askResponseSchema.parse(parsed);
    const grounded = enforceAskResponseGrounding(parsedOut, snapshot);

    if (grounded.type === "freeform") {
      const cite = validateFreeformCitations(grounded.citations, snapshot);
      if (!cite.ok) {
        console.error("[ask-keel] citation validation", { userId, reasons: cite.reasons });
        const fallback = askResponseSchema.parse({
          type: "freeform",
          headline: "I'm having trouble matching that to your data.",
          body: "Try rephrasing, or check Timeline for the exact figures.",
          answerValidationFailed: true,
          confidence: "low",
        });
        return NextResponse.json({ data: fallback });
      }
    }

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
