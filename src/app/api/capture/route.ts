/**
 * Capture classify + parse API (JSON in/out).
 *
 * Authenticates with Supabase, rate limits (`assertWithinAiRateLimit`), respects
 * `KEEL_AI_ENABLED`, tripwires, and daily cost ceiling. Returns structured payloads
 * for commitments, incomes, or assets.
 *
 * @module app/api/capture/route
 */

import { NextResponse } from "next/server";

import { classifyCaptureSentence } from "@/lib/ai/classify-capture";
import { parseAssetCapture, parseCommitmentCapture, parseIncomeCapture } from "@/lib/ai/parse-capture";
import {
  assertWithinAiCostCeil,
  assertWithinAiRateLimit,
  defaultAiCostCeilingCentsAud,
} from "@/lib/ai/rate-limit";
import { checkTripwires } from "@/lib/ai/tripwires";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Per-user capture output must never sit in a shared cache.
const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, private",
} as const;

function privateJson(body: unknown, init?: { status?: number }): NextResponse {
  return NextResponse.json(body, { ...init, headers: NO_STORE_HEADERS });
}

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.getUser();

    if (error) {
      return privateJson({ error: error.message }, { status: 401 });
    }

    if (!data.user) {
      return privateJson({ error: "Not authenticated." }, { status: 401 });
    }

    const userId = data.user.id;

    await assertWithinAiRateLimit({ userId, limit: 20, windowMs: 60 * 60 * 1000 });

    const body = (await request.json()) as {
      sentence?: string;
      forcedKind?: "commitment" | "income" | "asset";
    };
    const sentence = String(body.sentence ?? "").trim();
    if (!sentence) {
      return privateJson({ error: "Sentence is required." }, { status: 400 });
    }

    const trip = checkTripwires(sentence);
    if (!trip.ok) {
      console.error("[capture] tripwire", { userId, reason: trip.reason, length: sentence.length });
      return privateJson({ error: trip.userMessage }, { status: 200 });
    }

    if (process.env.KEEL_AI_ENABLED !== "true") {
      return privateJson({ error: "Capture is offline right now." }, { status: 503 });
    }

    const ceiling = defaultAiCostCeilingCentsAud();
    if ((await assertWithinAiCostCeil({ userId, ceilingCentsAud: ceiling })).ok === false) {
      return privateJson(
        { error: "You've used Ask Keel's quota for today. It'll refresh tomorrow." },
        { status: 200 },
      );
    }

    const forced = body.forcedKind;
    const cost = { userId };
    const classified =
      forced === "commitment" || forced === "income" || forced === "asset"
        ? { kind: forced }
        : await classifyCaptureSentence(sentence, cost);
    const kind = classified.kind;

    if ((await assertWithinAiCostCeil({ userId, ceilingCentsAud: ceiling })).ok === false) {
      return privateJson(
        { error: "You've used Ask Keel's quota for today. It'll refresh tomorrow." },
        { status: 200 },
      );
    }

    if (kind === "unknown") {
      return privateJson({ kind: "unknown" as const });
    }

    if (kind === "commitment") {
      const payload = await parseCommitmentCapture(sentence, cost);
      return privateJson({ kind: "commitment" as const, payload });
    }

    if (kind === "income") {
      const payload = await parseIncomeCapture(sentence, cost);
      return privateJson({ kind: "income" as const, payload });
    }

    const payload = await parseAssetCapture(sentence, cost);
    return privateJson({ kind: "asset" as const, payload });
  } catch (error) {
    if (error instanceof Error && error.message === "RATE_LIMITED") {
      return privateJson({ error: "You’ve hit the hourly capture limit. Try again soon." }, { status: 429 });
    }

    const message = error instanceof Error ? error.message : "Unable to capture.";
    return privateJson({ error: message }, { status: 400 });
  }
}
