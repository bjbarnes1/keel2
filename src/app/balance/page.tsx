import Link from "next/link";

import { updateBankBalanceAction } from "@/app/actions/keel";
import { ModalSheet } from "@/components/keel/primitives";
import { SubmitButton } from "@/components/keel/submit-button";
import { getDashboardSnapshot } from "@/lib/persistence/keel-store";

export const dynamic = "force-dynamic";

export default async function BalancePage() {
  const snapshot = await getDashboardSnapshot();

  return (
    <ModalSheet
      title="Update your balance"
      description="Check your main account balance and enter it here. Keel uses this to calculate your Available Money."
      backHref="/"
    >
      <form action={updateBankBalanceAction} className="space-y-4">
        <input
          name="amount"
          defaultValue={snapshot.bankBalance}
          className="w-full rounded-2xl border border-border bg-muted px-4 py-5 text-center font-mono text-4xl outline-none"
        />
        <p className="text-xs text-muted-foreground">Last updated: {snapshot.balanceAsOf}</p>
        <div className="space-y-3">
          <SubmitButton label="Update" pendingLabel="Updating…" />
          <Link
            href="/"
            className="block w-full rounded-2xl border border-border px-4 py-4 text-center text-sm text-muted-foreground"
          >
            Cancel
          </Link>
        </div>
      </form>
    </ModalSheet>
  );
}
