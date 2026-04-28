/**
 * Up webhook receiver (placeholder): verify shared secret, acknowledge. Full signature
 * verification can be added when webhook keys are provisioned.
 *
 * @module app/api/up/webhook
 */

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const expected = process.env.KEEL_UP_WEBHOOK_SECRET?.trim();
  if (!expected) {
    return NextResponse.json({ ok: false, error: "Webhook not configured." }, { status: 503 });
  }

  const token = request.headers.get("x-keel-webhook-secret");
  if (token !== expected) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  await request.text().catch(() => "");
  return NextResponse.json({ ok: true, received: true }, { headers: { "Cache-Control": "no-store" } });
}
