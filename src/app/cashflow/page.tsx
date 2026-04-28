/**
 * Fortnight cashflow table + illustrative transfer hints (non-authoritative).
 *
 * @module app/cashflow/page
 */

import { AppShell, SurfaceCard } from "@/components/keel/primitives";
import { buildFortnightCashflowTable } from "@/lib/engine/fortnight-cashflow";
import { buildHouseholdMoneyHints } from "@/lib/engine/allocation-hints";
import {
  getDashboardSnapshot,
  getHouseholdConfig,
  getProjectionEngineInput,
} from "@/lib/persistence/keel-store";
import { formatAud } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function CashflowPage() {
  const [snapshot, engine, household] = await Promise.all([
    getDashboardSnapshot(),
    getProjectionEngineInput(),
    getHouseholdConfig(),
  ]);

  const rows = buildFortnightCashflowTable({
    state: engine.state,
    activeSkips: engine.activeSkips,
    asOfIso: snapshot.balanceAsOfIso,
    startingAvailableMoney: snapshot.availableMoney,
  });

  const hints = buildHouseholdMoneyHints({
    availableMoney: snapshot.availableMoney,
    floatThreshold: household.ubankFloatThreshold ?? null,
  });

  return (
    <AppShell title="Cashflow" currentPath="/cashflow" backHref="/">
      <SurfaceCard className="mb-4">
        <p className="text-sm text-muted-foreground">
          26-fortnight projection from your current commitments and pay schedule. Numbers are indicative — perform real
          transfers in your banking apps.
        </p>
      </SurfaceCard>

      <SurfaceCard className="mb-6">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">This fortnight (hints)</p>
        <p className="mt-2 text-sm">
          Float target {formatAud(hints.ubankFloatTarget)} · suggested to everyday spend{" "}
          <span className="font-mono font-medium">{formatAud(hints.suggestedToSpendEveryday)}</span> · to secondary saver{" "}
          <span className="font-mono font-medium">{formatAud(hints.suggestedToSecondarySaver)}</span>
        </p>
        <p className="mt-2 text-xs text-muted-foreground">{hints.notes}</p>
      </SurfaceCard>

      <div className="overflow-x-auto rounded-[var(--radius-md)] border border-white/10">
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead className="bg-white/[0.04] text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2">#</th>
              <th className="px-3 py-2">Start</th>
              <th className="px-3 py-2">End</th>
              <th className="px-3 py-2 text-right">End available</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.index} className="border-t border-white/[0.06]">
                <td className="px-3 py-2 tabular-nums">{r.index}</td>
                <td className="px-3 py-2 font-mono text-xs">{r.startIso}</td>
                <td className="px-3 py-2 font-mono text-xs">{r.endIso}</td>
                <td className="px-3 py-2 text-right font-mono">{formatAud(r.endProjectedAvailableMoney)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
