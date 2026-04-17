import Link from "next/link";

import { AppShell, SectionTitle, SurfaceCard } from "@/components/keel/primitives";
import { getSpendOverview } from "@/lib/persistence/keel-store";
import { formatAud } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function SpendPage({
  searchParams,
}: {
  searchParams: Promise<{ imported?: string; skipped?: string; issues?: string }>;
}) {
  const params = await searchParams;
  const overview = await getSpendOverview();

  return (
    <AppShell title="Spend" currentPath="/spend" backHref="/">
      <div className="flex flex-wrap gap-2">
        <Link
          href="/spend/import"
          className="rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium text-primary"
        >
          Import CSV
        </Link>
        <Link
          href="/spend/reconcile"
          className="rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium text-primary"
        >
          Reconcile
          {overview.needsReview > 0 ? ` (${overview.needsReview})` : ""}
        </Link>
        <Link
          href="/spend/report"
          className="rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium text-primary"
        >
          vs Budget
        </Link>
        <Link
          href="/spend/accounts/new"
          className="rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium text-primary"
        >
          New account
        </Link>
      </div>

      {params.imported ? (
        <SurfaceCard className="mt-4 border-emerald-500/30 bg-emerald-500/5">
          <p className="text-sm font-medium text-emerald-700">
            Imported {params.imported} new rows
            {params.skipped ? ` · skipped ${params.skipped} duplicates` : ""}
            {params.issues ? ` · ${params.issues} parser warnings` : ""}.
          </p>
        </SurfaceCard>
      ) : null}

      <SectionTitle title="Accounts" />
      {overview.accounts.length === 0 ? (
        <SurfaceCard>
          <p className="text-sm text-muted-foreground">
            Add a spend account (for example, your everyday banking export), then import a CSV to start
            reconciling.
          </p>
        </SurfaceCard>
      ) : (
        <div className="space-y-2">
          {overview.accounts.map((account) => (
            <SurfaceCard key={account.id} className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">{account.name}</p>
                <p className="text-xs text-muted-foreground">
                  {account.bankName ? `${account.bankName} · ` : ""}
                  {account.maskedAccountNumber ? `${account.maskedAccountNumber} · ` : ""}
                  {account.currency}
                </p>
              </div>
            </SurfaceCard>
          ))}
        </div>
      )}

      <SectionTitle title="Recent activity" />
      {overview.recent.length === 0 ? (
        <SurfaceCard>
          <p className="text-sm text-muted-foreground">No transactions yet.</p>
        </SurfaceCard>
      ) : (
        <div className="space-y-2">
          {overview.recent.map((transaction) => (
            <SurfaceCard key={transaction.id} className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium">{transaction.memo}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {transaction.postedOn} · {transaction.accountName}
                  {transaction.categoryName ? ` · ${transaction.categoryName}` : " · needs category"}
                </p>
              </div>
              <p className="font-mono text-sm font-semibold">{formatAud(transaction.amount)}</p>
            </SurfaceCard>
          ))}
        </div>
      )}
    </AppShell>
  );
}
