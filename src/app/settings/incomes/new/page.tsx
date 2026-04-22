/**
 * Legacy incomes creation path — redirect to top-level `/incomes/new`.
 *
 * @module app/settings/incomes/new/page
 */

import { redirect } from "next/navigation";

export default function LegacyNewIncomePage() {
  redirect("/incomes/new");
}
