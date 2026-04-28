/**
 * Legacy timeline route retained as a redirect to `/cashflow`.
 *
 * @module app/timeline/page
 */

import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function TimelinePage() {
  redirect("/cashflow");
}
