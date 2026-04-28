"use server";

/**
 * Server Actions for Up Bank PAT sync and spend-account linking.
 *
 * @module app/actions/up-sync
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getBudgetContext } from "@/lib/persistence/auth";
import { linkSpendAccountToUp } from "@/lib/persistence/spend";
import { syncUpTransactionsForBudget } from "@/lib/up/sync-up-transactions";

function requireUpToken() {
  const token = process.env.KEEL_UP_BANK_TOKEN?.trim();
  if (!token) {
    throw new Error("KEEL_UP_BANK_TOKEN is not configured on the server.");
  }
  return token;
}

export async function linkUpSpendAccountAction(formData: FormData) {
  const spendAccountId = String(formData.get("spendAccountId") ?? "").trim();
  const upAccountId = String(formData.get("upAccountId") ?? "").trim();
  if (!spendAccountId || !upAccountId) {
    throw new Error("Spend account and Up account id are required.");
  }
  await linkSpendAccountToUp({ spendAccountId, upAccountId });
  revalidatePath("/spend");
  revalidatePath("/spend/up");
  redirect("/spend/up?linked=1");
}

export async function syncUpBankAction(formData: FormData) {
  const spendAccountId = String(formData.get("spendAccountId") ?? "").trim();
  const since = String(formData.get("since") ?? "").trim();
  if (!spendAccountId) throw new Error("Spend account is required.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(since)) {
    throw new Error("Since date must be YYYY-MM-DD.");
  }

  const token = requireUpToken();
  const { budget } = await getBudgetContext();

  const result = await syncUpTransactionsForBudget({
    budgetId: budget.id,
    spendAccountId,
    token,
    since,
  });

  revalidatePath("/");
  revalidatePath("/spend");
  revalidatePath("/spend/reconcile");

  redirect(
    `/spend/up?upserted=${encodeURIComponent(String(result.upserted))}&skipped=${encodeURIComponent(String(result.skippedOtherAccount))}`,
  );
}
