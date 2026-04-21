/**
 * Parses a free-text bill description into structured fields via `parseBillDescription`.
 *
 * **Auth note:** this handler currently does not verify a Supabase session — it relies on
 * same-origin browser policy and is intended for quick manual intake. If exposed to
 * untrusted networks, add `createSupabaseServerClient` + `getUser` parity with `/api/capture`.
 *
 * @module app/api/parse-bill/route
 */

import { NextResponse } from "next/server";

import { parseBillDescription } from "@/lib/ai/parse-bill";

export async function POST(request: Request) {
  try {
    const { description } = (await request.json()) as { description?: string };
    const parsed = await parseBillDescription(description ?? "");

    return NextResponse.json({ success: true, data: parsed });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to parse bill.";

    return NextResponse.json(
      { success: false, error: message },
      { status: 400 },
    );
  }
}
