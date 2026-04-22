/**
 * Legacy full-screen income edit — redirects to list + sheet (`?edit=`).
 *
 * @module app/settings/incomes/[id]/edit/page
 */

import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function LegacyIncomeEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/settings/incomes?edit=${encodeURIComponent(id)}`);
}
