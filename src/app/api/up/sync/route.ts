/**
 * POST JSON `{ spendAccountId, since }` — Supabase session cookie auth; uses `KEEL_UP_BANK_TOKEN`.
 *
 * @module app/api/up/sync
 */

import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getBudgetContext } from "@/lib/persistence/auth";
import { syncUpTransactionsForBudget } from "@/lib/up/sync-up-transactions";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const token = process.env.KEEL_UP_BANK_TOKEN?.trim();
  if (!token) {
    return NextResponse.json({ ok: false, error: "KEEL_UP_BANK_TOKEN is not configured." }, { status: 503 });
  }

  const body = (await request.json().catch(() => null)) as null | {
    spendAccountId?: string;
    since?: string;
  };
  const spendAccountId = body?.spendAccountId?.trim();
  const since = body?.since?.trim();
  if (!spendAccountId || !since || !/^\d{4}-\d{2}-\d{2}$/.test(since)) {
    return NextResponse.json({ ok: false, error: "spendAccountId and since (YYYY-MM-DD) required." }, { status: 400 });
  }

  const { budget } = await getBudgetContext();
  const result = await syncUpTransactionsForBudget({
    budgetId: budget.id,
    spendAccountId,
    token,
    since,
  });

  return NextResponse.json({ ok: true, result }, { headers: { "Cache-Control": "no-store" } });
}
