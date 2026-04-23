/**
 * Parses a free-text bill description into structured fields via `parseBillDescription`.
 *
 * Authenticated via Supabase + rate-limited (20/hr/user) + cost-capped, in parity with
 * `/api/capture`. Historically this endpoint leaned on same-origin browser policy, which
 * is not a sufficient guard — any request carrying a valid cookie (or a misconfigured
 * CDN / SSRF path) would otherwise burn the Anthropic quota.
 *
 * @module app/api/parse-bill/route
 */

import { NextResponse } from "next/server";

import { parseBillDescription } from "@/lib/ai/parse-bill";
import {
  assertWithinAiCostCeil,
  assertWithinAiRateLimit,
  defaultAiCostCeilingCentsAud,
} from "@/lib/ai/rate-limit";
import { checkTripwires } from "@/lib/ai/tripwires";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, private",
} as const;

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.getUser();

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 401, headers: NO_STORE_HEADERS },
      );
    }

    if (!data.user) {
      return NextResponse.json(
        { success: false, error: "Not authenticated." },
        { status: 401, headers: NO_STORE_HEADERS },
      );
    }

    const userId = data.user.id;

    await assertWithinAiRateLimit({ userId, limit: 20, windowMs: 60 * 60 * 1000 });

    const { description } = (await request.json()) as { description?: string };
    const sentence = String(description ?? "").trim();

    const trip = checkTripwires(sentence);
    if (!trip.ok) {
      console.error("[parse-bill] tripwire", { userId, reason: trip.reason, length: sentence.length });
      return NextResponse.json(
        { success: false, error: trip.userMessage },
        { status: 200, headers: NO_STORE_HEADERS },
      );
    }

    const ceiling = defaultAiCostCeilingCentsAud();
    if ((await assertWithinAiCostCeil({ userId, ceilingCentsAud: ceiling })).ok === false) {
      return NextResponse.json(
        { success: false, error: "You've used Ask Keel's quota for today. It'll refresh tomorrow." },
        { status: 200, headers: NO_STORE_HEADERS },
      );
    }

    const parsed = await parseBillDescription(sentence);

    return NextResponse.json(
      { success: true, data: parsed },
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    if (error instanceof Error && error.message === "RATE_LIMITED") {
      return NextResponse.json(
        { success: false, error: "You've hit the hourly limit. Try again soon." },
        { status: 429, headers: NO_STORE_HEADERS },
      );
    }
    const message = error instanceof Error ? error.message : "Unable to parse bill.";
    return NextResponse.json(
      { success: false, error: message },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }
}
