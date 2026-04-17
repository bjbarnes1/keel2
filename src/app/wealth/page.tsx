import Link from "next/link";

import { AppShell, SurfaceCard } from "@/components/keel/primitives";
import { getWealthSnapshot } from "@/lib/persistence/keel-store";
import { formatAud } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function WealthPage() {
  const snapshot = await getWealthSnapshot();

  return (
    <AppShell title="Wealth" currentPath="/wealth">
      <SurfaceCard className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs text-muted-foreground">Net worth (tracked assets)</p>
          <p className="mt-2 font-mono text-3xl font-bold text-emerald-500">
            {formatAud(snapshot.totalValue)}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Manual values for now. Live pricing comes later.
          </p>
        </div>
        <Link
          href="/wealth/new"
          className="rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium text-primary"
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
              <p className="font-mono text-sm font-semibold">
                {formatAud(holding.value)}
              </p>
            </SurfaceCard>
          ))
        )}
      </div>
    </AppShell>
  );
}

