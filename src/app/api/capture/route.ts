import { NextResponse } from "next/server";

import { classifyCaptureSentence } from "@/lib/ai/classify-capture";
import { parseAssetCapture, parseCommitmentCapture, parseIncomeCapture } from "@/lib/ai/parse-capture";
import { assertWithinAiRateLimit } from "@/lib/ai/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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

    assertWithinAiRateLimit({ userId: data.user.id, limit: 20, windowMs: 60 * 60 * 1000 });

    const body = (await request.json()) as {
      sentence?: string;
      forcedKind?: "commitment" | "income" | "asset";
    };
    const sentence = String(body.sentence ?? "").trim();
    if (!sentence) {
      return NextResponse.json({ error: "Sentence is required." }, { status: 400 });
    }

    if (process.env.KEEL_AI_ENABLED !== "true") {
      return NextResponse.json({ error: "Capture is offline right now." }, { status: 503 });
    }

    const forced = body.forcedKind;
    const kind =
      forced === "commitment" || forced === "income" || forced === "asset"
        ? forced
        : await classifyCaptureSentence(sentence);

    if (kind === "unknown") {
      return NextResponse.json({ kind: "unknown" as const });
    }

    if (kind === "commitment") {
      const payload = await parseCommitmentCapture(sentence);
      return NextResponse.json({ kind: "commitment" as const, payload });
    }

    if (kind === "income") {
      const payload = await parseIncomeCapture(sentence);
      return NextResponse.json({ kind: "income" as const, payload });
    }

    const payload = await parseAssetCapture(sentence);
    return NextResponse.json({ kind: "asset" as const, payload });
  } catch (error) {
    if (error instanceof Error && error.message === "RATE_LIMITED") {
      return NextResponse.json({ error: "You’ve hit the hourly capture limit. Try again soon." }, { status: 429 });
    }

    const message = error instanceof Error ? error.message : "Unable to capture.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
