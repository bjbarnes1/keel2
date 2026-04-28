/**
 * Vercel Cron: bearer `CRON_SECRET` (or `Authorization: Bearer …`). Returns SQL-based alerts
 * per budget without an interactive session.
 *
 * @module app/api/cron/daily-alerts
 */

import { NextResponse } from "next/server";

import { scanAllBudgetAlerts } from "@/lib/alerts/cron-budget-scan";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET is not set." }, { status: 503 });
  }

  const auth = request.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const bundles = await scanAllBudgetAlerts();
  return NextResponse.json(
    { ok: true, checkedAt: new Date().toISOString(), bundles },
    { headers: { "Cache-Control": "no-store" } },
  );
}
