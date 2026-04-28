/**
 * Desktop-first household dashboard: total position, cash vs wealth, pay-cycle context,
 * and action-item counts. Data is passed from the home Server Component — no client fetch.
 *
 * @module components/keel/household-cockpit
 */

import Link from "next/link";

import { getCurrentPayPeriod } from "@/lib/engine/keel";
import type { DashboardSnapshot } from "@/lib/types";
import { formatAud, formatDisplayDate } from "@/lib/utils";

import { SurfaceCard } from "@/components/keel/primitives";

export type CockpitWealthHolding = {
  id: string;
  name: string;
  assetType: string;
  symbol?: string;
  quantity: string;
  value: number;
  asOf?: string;
};

export type CockpitSpendSummary = {
  needsReview: number;
  accountCount: number;
};

export type PayFortnightSummary = {
  label: string;
  dayProgress: string;
  nextPayLabel?: string;
};

function groupWealthByAssetType(holdings: CockpitWealthHolding[]) {
  const buckets = new Map<string, number>();
  const normalize = (t: string) => t.toUpperCase();
  for (const h of holdings) {
    const at = normalize(h.assetType);
    const key =
      at === "SUPER" || h.name.toLowerCase().includes("super")
        ? "Super"
        : at === "CRYPTO" || h.symbol === "BTC" || h.name.toLowerCase().includes("bitcoin")
          ? "Crypto"
          : at === "SHARES" || at === "ETF" || h.symbol
            ? "Shares & listed"
            : at === "CASH" || at === "OFFSET"
              ? "Cash & offset"
              : "Other";
    buckets.set(key, (buckets.get(key) ?? 0) + h.value);
  }
  return Array.from(buckets.entries()).sort((a, b) => b[1] - a[1]);
}

export function HouseholdCockpit({
  snapshot,
  wealthHoldings,
  wealthTotal,
  spend,
  payFortnight,
  actionExtras,
}: {
  snapshot: DashboardSnapshot;
  wealthHoldings: CockpitWealthHolding[];
  wealthTotal: number;
  spend: CockpitSpendSummary;
  payFortnight: PayFortnightSummary | null;
  /** Optional counts from medical/rebate modules when present. */
  actionExtras?: { outstandingRebates?: number; medicalGaps?: number };
}) {
  const totalPosition = snapshot.bankBalance + wealthTotal;
  const attentionBills = snapshot.commitments.filter((c) => c.isAttention).length;
  const min12m = snapshot.forecast.twelveMonths.minProjectedAvailableMoney;
  const projectedStress = min12m < 0;

  const actionCount =
    spend.needsReview +
    attentionBills +
    (actionExtras?.outstandingRebates ?? 0) +
    (actionExtras?.medicalGaps ?? 0) +
    (projectedStress ? 1 : 0);

  const wealthGroups = groupWealthByAssetType(wealthHoldings);
  const sinkingPreview = snapshot.commitments
    .filter((c) => c.percentFunded < 100)
    .slice(0, 4);

  return (
    <div className="mt-2 space-y-4 lg:mt-0">
      <div className="glass-clear rounded-[var(--radius-xl)] p-5 lg:p-6">
        <p className="label-upper">Household position</p>
        <p className="mt-2 font-mono text-4xl font-medium tabular-nums tracking-[-0.03em] text-[color:var(--keel-ink)] lg:text-5xl">
          {formatAud(totalPosition)}
        </p>
        <p className="mt-2 text-sm text-[color:var(--keel-ink-3)]">
          {snapshot.budgetName} · bank {formatAud(snapshot.bankBalance)} + investments{" "}
          {formatAud(wealthTotal)}
        </p>
      </div>

      <div className="grid gap-3 lg:grid-cols-2 lg:gap-4">
        <SurfaceCard className="lg:p-5">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-[color:var(--keel-ink-5)]">
            Cash &amp; runway
          </p>
          <ul className="mt-3 space-y-2 text-sm">
            <li className="flex justify-between gap-3">
              <span className="text-[color:var(--keel-ink-3)]">Available now</span>
              <span className="font-mono tabular-nums font-medium text-[color:var(--keel-safe-soft)]">
                {formatAud(snapshot.availableMoney)}
              </span>
            </li>
            <li className="flex justify-between gap-3">
              <span className="text-[color:var(--keel-ink-3)]">Reserved + goals</span>
              <span className="font-mono tabular-nums text-[color:var(--keel-ink-2)]">
                {formatAud(snapshot.totalReserved + snapshot.totalGoalContributions)}
              </span>
            </li>
            <li className="flex justify-between gap-3 border-t border-border pt-2">
              <span className="text-[color:var(--keel-ink-3)]">12-mo min projected</span>
              <span
                className={
                  projectedStress
                    ? "font-mono tabular-nums font-medium text-[color:var(--keel-attend)]"
                    : "font-mono tabular-nums text-[color:var(--keel-ink)]"
                }
              >
                {formatAud(min12m)}
              </span>
            </li>
          </ul>
        </SurfaceCard>

        <SurfaceCard className="lg:p-5">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-[color:var(--keel-ink-5)]">
            This pay cycle
          </p>
          {payFortnight ? (
            <div className="mt-3 space-y-2 text-sm">
              <p className="font-medium text-[color:var(--keel-ink)]">{payFortnight.label}</p>
              <p className="text-[color:var(--keel-ink-3)]">{payFortnight.dayProgress}</p>
              {payFortnight.nextPayLabel ? (
                <p className="text-xs text-[color:var(--keel-ink-4)]">Next pay {payFortnight.nextPayLabel}</p>
              ) : null}
            </div>
          ) : (
            <p className="mt-3 text-sm text-[color:var(--keel-ink-3)]">
              Add a primary income to anchor pay cycles.
            </p>
          )}
        </SurfaceCard>
      </div>

      <div className="grid gap-3 lg:grid-cols-2 lg:gap-4">
        <SurfaceCard className="lg:p-5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-[color:var(--keel-ink-5)]">
              Investments &amp; wealth
            </p>
            <Link href="/wealth" className="text-xs font-medium text-primary">
              Position
            </Link>
          </div>
          {wealthGroups.length === 0 ? (
            <p className="mt-3 text-sm text-[color:var(--keel-ink-3)]">
              No holdings yet — add super, shares, or BTC on the Wealth tab.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {wealthGroups.map(([label, value]) => (
                <li key={label} className="flex justify-between gap-3 text-sm">
                  <span className="text-[color:var(--keel-ink-3)]">{label}</span>
                  <span className="font-mono tabular-nums text-[color:var(--keel-ink)]">{formatAud(value)}</span>
                </li>
              ))}
            </ul>
          )}
        </SurfaceCard>

        <SurfaceCard className="lg:p-5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-[color:var(--keel-ink-5)]">
              Sinking &amp; bills
            </p>
            <Link href="/commitments" className="text-xs font-medium text-primary">
              All
            </Link>
          </div>
          {sinkingPreview.length === 0 ? (
            <p className="mt-3 text-sm text-[color:var(--keel-ink-3)]">No open commitments.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {sinkingPreview.map((c) => (
                <li key={c.id} className="flex justify-between gap-3 text-sm">
                  <Link href={`/commitments/${c.id}`} className="truncate text-[color:var(--keel-ink)] hover:underline">
                    {c.name}
                  </Link>
                  <span className="shrink-0 font-mono tabular-nums text-[color:var(--keel-ink-3)]">
                    {c.percentFunded}%
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SurfaceCard>
      </div>

      <SurfaceCard className="border border-[color:var(--keel-attend)]/22 bg-[color:var(--keel-attend)]/6 lg:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-[color:var(--keel-ink-5)]">
              Action items
            </p>
            <p className="mt-1 text-lg font-semibold text-[color:var(--keel-ink)]">{actionCount} open</p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            {spend.needsReview > 0 ? (
              <Link
                href="/spend"
                className="rounded-full bg-[color:var(--keel-ink-6)] px-3 py-1 font-medium text-[color:var(--keel-ink)] hover:bg-[color:var(--keel-ink-6)]/80"
              >
                {spend.needsReview} spend triage
              </Link>
            ) : null}
            {attentionBills > 0 ? (
              <Link
                href="/commitments"
                className="rounded-full bg-[color:var(--keel-ink-6)] px-3 py-1 font-medium text-[color:var(--keel-ink)] hover:bg-[color:var(--keel-ink-6)]/80"
              >
                {attentionBills} bills need funding
              </Link>
            ) : null}
            {(actionExtras?.outstandingRebates ?? 0) > 0 ? (
              <Link
                href="/medical"
                className="rounded-full bg-[color:var(--keel-ink-6)] px-3 py-1 font-medium text-[color:var(--keel-ink)] hover:bg-[color:var(--keel-ink-6)]/80"
              >
                {actionExtras!.outstandingRebates} rebates
              </Link>
            ) : null}
            {projectedStress ? (
              <Link
                href="/cashflow"
                className="rounded-full bg-[color:var(--keel-ink-6)] px-3 py-1 font-medium text-[color:var(--keel-attend)] hover:bg-[color:var(--keel-ink-6)]/80"
              >
                12-mo shortfall risk
              </Link>
            ) : null}
          </div>
        </div>
        {actionCount === 0 ? (
          <p className="mt-3 text-sm text-[color:var(--keel-ink-3)]">Nothing urgent — Keel is calm.</p>
        ) : null}
      </SurfaceCard>
    </div>
  );
}

/** Uses the engine pay window so cockpit copy matches timeline attention logic. */
export function payFortnightFromSnapshot(snapshot: DashboardSnapshot): PayFortnightSummary | null {
  const primary =
    snapshot.incomes.find((i) => i.id === snapshot.primaryIncomeId) ?? snapshot.incomes[0];
  if (!primary?.nextPayDateIso) return null;

  const asOf = new Date(`${snapshot.balanceAsOfIso}T00:00:00Z`);
  const period = getCurrentPayPeriod(
    {
      id: primary.id,
      name: primary.name,
      amount: primary.amount,
      frequency: primary.frequency,
      nextPayDate: primary.nextPayDateIso,
    },
    asOf,
  );

  const fmt = (iso: string) => formatDisplayDate(iso, "short");
  return {
    label: `${fmt(period.start.toISOString().slice(0, 10))} → ${fmt(period.end.toISOString().slice(0, 10))}`,
    dayProgress: `Day ${period.dayIndex} of ${period.totalDays} (${primary.frequency})`,
    nextPayLabel: fmt(primary.nextPayDateIso),
  };
}
