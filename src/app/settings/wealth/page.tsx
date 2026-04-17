import Link from "next/link";

import { Sparkline } from "@/components/keel/sparkline";
import { AppShell, SurfaceCard } from "@/components/keel/primitives";
import { SubmitButton } from "@/components/keel/submit-button";
import { deleteWealthHoldingAction } from "@/app/actions/keel-wealth";
import { getWealthHistory, getWealthSnapshot } from "@/lib/persistence/keel-store";
import { formatAud } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function SettingsWealthPage() {
  const [snapshot, history] = await Promise.all([
    getWealthSnapshot(),
    getWealthHistory({ years: 3 }),
  ]);

  return (
    <AppShell title="Wealth" currentPath="/settings" backHref="/settings">
      <SurfaceCard className="flex items-start justify-between gap-4">
        <div>
          <p className="label-upper">Net worth (tracked assets)</p>
          <p className="tabular-nums mt-2 font-mono text-3xl font-medium text-primary">
            {formatAud(snapshot.totalValue)}
          </p>
          {history.values.length ? (
            <div className="mt-3">
              <Sparkline values={history.values} />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Last 3 years (monthly)
              </p>
            </div>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">
              Add holdings over time to build a 3-year sparkline.
            </p>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            Manual values for now. Live pricing comes later.
          </p>
        </div>
        <Link
          href="/settings/wealth/new"
          className="glass-clear rounded-[var(--radius-sm)] px-3 py-2 text-sm font-medium text-primary"
        >
          + Add
        </Link>
      </SurfaceCard>

      <div className="mt-4 space-y-2">
        {snapshot.holdings.length === 0 ? (
          <SurfaceCard>
            <p className="text-sm text-muted-foreground">
              Add a holding (shares or bitcoin) to start tracking wealth.
            </p>
          </SurfaceCard>
        ) : (
          snapshot.holdings.map((holding) => (
            <SurfaceCard key={holding.id} className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium">{holding.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {holding.symbol ? `${holding.symbol} · ` : ""}
                  {holding.quantity} units
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {holding.asOf ? `As of ${holding.asOf}` : "As of: not set"}
                </p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <p className="tabular-nums font-mono text-sm font-medium">
                  {formatAud(holding.value)}
                </p>
                <form action={deleteWealthHoldingAction.bind(null, holding.id)}>
                  <SubmitButton
                    label="Delete"
                    pendingLabel="Deleting…"
                    variant="outline"
                    className="w-auto rounded-[var(--radius-sm)] border-white/10 px-3 py-2 text-xs text-muted-foreground hover:text-foreground"
                  />
                </form>
              </div>
            </SurfaceCard>
          ))
        )}
      </div>
    </AppShell>
  );
}
