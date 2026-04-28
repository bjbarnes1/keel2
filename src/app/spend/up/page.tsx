/**
 * Link a Keel spend account to an Up account id and trigger PAT sync (requires env token).
 *
 * @module app/spend/up
 */

import Link from "next/link";

import { linkUpSpendAccountAction, syncUpBankAction } from "@/app/actions/up-sync";
import { AppShell, SurfaceCard } from "@/components/keel/primitives";
import { SubmitButton } from "@/components/keel/submit-button";
import { listUpAccounts } from "@/lib/up/up-client";
import { getSpendOverview } from "@/lib/persistence/keel-store";

export const dynamic = "force-dynamic";

export default async function SpendUpPage({
  searchParams,
}: {
  searchParams: Promise<{ upserted?: string; skipped?: string; linked?: string }>;
}) {
  const params = await searchParams;
  const overview = await getSpendOverview();
  const token = process.env.KEEL_UP_BANK_TOKEN?.trim();
  const upAccounts = token
    ? await listUpAccounts(token).catch(() => ({ data: [] as { id: string; attributes: { displayName: string } }[] }))
    : { data: [] as { id: string; attributes: { displayName: string } }[] };

  const sinceDefault = new Date();
  sinceDefault.setUTCDate(sinceDefault.getUTCDate() - 90);
  const sinceStr = sinceDefault.toISOString().slice(0, 10);

  return (
    <AppShell title="Up Bank" currentPath="/spend" backHref="/spend">
      {!token ? (
        <SurfaceCard className="mb-4 border-amber-500/30 bg-amber-500/5">
          <p className="text-sm text-amber-200">
            Set <code className="rounded bg-black/30 px-1">KEEL_UP_BANK_TOKEN</code> on the server to enable listing
            accounts and sync.
          </p>
        </SurfaceCard>
      ) : null}

      {params.linked ? (
        <SurfaceCard className="mb-4 border-emerald-500/30 bg-emerald-500/5">
          <p className="text-sm text-emerald-700">Up account linked.</p>
        </SurfaceCard>
      ) : null}
      {params.upserted != null ? (
        <SurfaceCard className="mb-4 border-emerald-500/30 bg-emerald-500/5">
          <p className="text-sm text-emerald-700">
            Sync complete · upserted {params.upserted}
            {params.skipped != null ? ` · skipped other accounts ${params.skipped}` : ""}
          </p>
        </SurfaceCard>
      ) : null}

      <SurfaceCard className="mb-4">
        <p className="text-sm text-muted-foreground">
          Paste the Up <strong>account id</strong> for your joint transactional account (shown below when the token is
          configured). Keel stores rows idempotently on Up transaction ids.
        </p>
      </SurfaceCard>

      {token && upAccounts.data.length > 0 ? (
        <SurfaceCard className="mb-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Up accounts</p>
          <ul className="mt-2 space-y-1 text-sm">
            {upAccounts.data.map((a) => (
              <li key={a.id} className="font-mono text-xs">
                {a.attributes.displayName} · {a.id}
              </li>
            ))}
          </ul>
        </SurfaceCard>
      ) : null}

      {overview.accounts.length === 0 ? (
        <SurfaceCard>
          <p className="text-sm text-muted-foreground">Add a spend account first, then return here to link Up.</p>
        </SurfaceCard>
      ) : (
        <>
          <form action={linkUpSpendAccountAction} className="mb-6 space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">Keel spend account</label>
              <select
                name="spendAccountId"
                required
                className="mt-1 block w-full max-w-md rounded-md border border-border bg-background px-2 py-2 text-sm"
                defaultValue={overview.accounts[0]?.id}
              >
                {overview.accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                    {a.upAccountId ? " · linked" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Up account id</label>
              <input
                name="upAccountId"
                required
                className="mt-1 block w-full max-w-md rounded-md border border-border bg-background px-2 py-2 text-sm font-mono text-xs"
                placeholder="uuid from Up"
              />
            </div>
            <SubmitButton label="Save link" pendingLabel="Saving…" />
          </form>

          <form action={syncUpBankAction} className="space-y-3">
            <input type="hidden" name="since" value={sinceStr} />
            <div>
              <label className="text-xs text-muted-foreground">Spend account to sync</label>
              <select
                name="spendAccountId"
                required
                className="mt-1 block w-full max-w-md rounded-md border border-border bg-background px-2 py-2 text-sm"
                defaultValue={overview.accounts.find((a) => a.upAccountId)?.id ?? overview.accounts[0]?.id}
              >
                {overview.accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                    {!a.upAccountId ? " (link Up id first)" : ""}
                  </option>
                ))}
              </select>
            </div>
            <p className="text-xs text-muted-foreground">
              Pulls settled transactions since {sinceStr} (UTC filter sent to Up).
            </p>
            <SubmitButton label="Sync now" pendingLabel="Syncing…" />
          </form>
        </>
      )}

      <p className="mt-6 text-sm">
        <Link href="/spend/rules" className="text-primary">
          Categorisation rules →
        </Link>
      </p>
    </AppShell>
  );
}
