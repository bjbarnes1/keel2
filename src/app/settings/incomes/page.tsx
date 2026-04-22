/**
 * Legacy incomes path — redirect to top-level `/incomes`.
 *
 * @module app/settings/incomes/page
 */

import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function LegacyIncomesPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>;
}) {
  const q = await searchParams;
  const edit = q.edit?.trim();
  redirect(edit ? `/incomes?edit=${encodeURIComponent(edit)}` : "/incomes");
}
