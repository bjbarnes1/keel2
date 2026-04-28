"use client";

/**
 * TimelineView — client-only orchestrator for the Timeline screen.
 *
 * Wires four concerns together:
 *   - `useTimelineEvents(focalDate)` owns the chunked event window.
 *   - `useTimelineSync()` owns the focal date + source lockout.
 *   - `WaterlineChart` renders the SVG + handles scrub gestures.
 *   - `AvailableMoneyCard` + `TimelineLegend` derive from the same state.
 *
 * No data fetching or state lives in the child components — they are pure
 * visual surfaces. If the foundation hooks' contract changes, this file is
 * the single place to reconcile.
 *
 * @module components/keel/timeline-view
 */

import { useMemo, useState } from "react";
import Link from "next/link";

import { TimelineLegend } from "@/components/keel/timeline-legend";
import { WaterlineChart } from "@/components/keel/waterline-chart";
import { availableMoneyAt } from "@/lib/engine/keel";
import { useTimelineEvents } from "@/lib/hooks/use-timeline-events";
import { useTimelineSync } from "@/lib/hooks/use-timeline-sync";
import { startOfUtcDay } from "@/lib/timeline/waterline-geometry";
import { formatAud } from "@/lib/utils";

export type AnnualTotals = {
  annualIncomeForecast: number;
  annualCommitmentsForecast: number;
  annualSpendActualToDate: number;
};

export type TimelineViewProps = {
  startingAvailableMoney: number;
  startingBankBalance: number;
  attentionCommitmentIds: string[];
  /** Surface a message when the user has nothing scheduled yet. */
  hasAnyScheduledEvents: boolean;
  annualTotals: AnnualTotals;
};

export function TimelineView({
  startingAvailableMoney,
  startingBankBalance,
  attentionCommitmentIds,
  hasAnyScheduledEvents,
  annualTotals,
}: TimelineViewProps) {
  // Today is stable for the lifetime of the mount — capturing once via lazy
  // initial state keeps availableMoneyAt + legend sectioning + focal
  // comparisons coherent across re-renders, even if the user leaves the tab
  // open past midnight. A new `today` would invalidate the focal date if we
  // let it drift.
  const [today] = useState<Date>(() => startOfUtcDay(new Date()));

  const sync = useTimelineSync(today);
  const {
    events,
    eventsInViewport,
    isLoading,
    hasReachedMaxHorizon,
    error,
  } = useTimelineEvents(sync.focalDate);

  const attentionSet = useMemo(
    () => new Set(attentionCommitmentIds),
    [attentionCommitmentIds],
  );

  const availableMoneyAtFocal = useMemo(() => {
    if (events.length === 0) return startingAvailableMoney;
    return availableMoneyAt(sync.focalDate, events, startingAvailableMoney);
  }, [events, sync.focalDate, startingAvailableMoney]);

  // Empty state — no events at all (brand-new user with no incomes/commitments).
  if (!hasAnyScheduledEvents) {
    return (
      <div className="flex flex-col gap-5">
        <div className="glass-clear flex flex-col items-center rounded-[var(--radius-md)] px-6 py-10 text-center">
          <p className="text-[13px] text-[color:var(--keel-ink-2)]">
            Your timeline will fill in as you add income and commitments.
          </p>
          <Link
            href="/commitments"
            className="glass-tint-safe mt-5 rounded-[var(--radius-pill)] px-5 py-2 text-[13px] font-medium text-[color:var(--keel-ink)] transition-opacity hover:opacity-90"
          >
            Add a commitment
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="relative">
        <WaterlineChart
          eventsInViewport={eventsInViewport}
          allEvents={events}
          focalDate={sync.focalDate}
          todayDate={today}
          onFocalChange={sync.setFocalDateFromChart}
          availableMoneyAtFocal={availableMoneyAtFocal}
          startingAvailableMoney={startingAvailableMoney}
          startingBankBalance={startingBankBalance}
          attentionCommitmentIds={attentionSet}
          className="lg:max-w-none"
        />

        {isLoading ? <TimelineShimmer /> : null}
      </div>

      {error ? (
        <div className="glass-tint-attend rounded-[var(--radius-sm)] px-4 py-3 text-[12px] text-[color:var(--keel-ink-2)]">
          Couldn&apos;t load your timeline. Reload to try again.
        </div>
      ) : null}

      {hasReachedMaxHorizon ? (
        <p className="px-1 text-[11px] text-[color:var(--keel-ink-4)]">
          Projections beyond 6 months are fuzzy. Keel will fill in the details as the time comes closer.
        </p>
      ) : null}

      <TimelineLegend
        allEvents={events}
        focalDate={sync.focalDate}
        todayDate={today}
        syncSource={sync.source}
        onRowTap={sync.setFocalDateFromLegend}
        onScroll={sync.setFocalDateFromLegend}
      />

      <AnnualTotalsStrip totals={annualTotals} />
    </div>
  );
}

function TimelineShimmer() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden rounded-[var(--radius-sm)]"
      style={{
        background:
          "linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.04) 50%, rgba(255,255,255,0) 100%)",
        backgroundSize: "200% 100%",
        animation: "keel-timeline-shimmer 1.6s linear infinite",
      }}
    >
      <style>{`
        @keyframes keel-timeline-shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          [aria-hidden="true"] { animation: none; }
        }
      `}</style>
    </div>
  );
}

function AnnualTotalsStrip({ totals }: { totals: AnnualTotals }) {
  return (
    <section className="glass-clear rounded-[var(--radius-md)] px-4 py-3">
      <div className="grid grid-cols-3 gap-3">
        <div>
          <p className="text-[11px] font-medium text-[color:var(--keel-ink-3)]">
            Annual income (forecast)
          </p>
          <p className="mt-2 font-mono text-sm tabular-nums text-[color:var(--keel-ink)]">
            {formatAud(totals.annualIncomeForecast)}
          </p>
        </div>
        <div>
          <p className="text-[11px] font-medium text-[color:var(--keel-ink-3)]">
            Annual commitments (forecast)
          </p>
          <p className="mt-2 font-mono text-sm tabular-nums text-[color:var(--keel-ink)]">
            {formatAud(totals.annualCommitmentsForecast)}
          </p>
        </div>
        <div>
          <p className="text-[11px] font-medium text-[color:var(--keel-ink-3)]">
            Spend allocated to commitments (last 12 months)
          </p>
          <p className="mt-2 font-mono text-sm tabular-nums text-[color:var(--keel-ink)]">
            {formatAud(totals.annualSpendActualToDate)}
          </p>
        </div>
      </div>
      <p className="mt-3 text-[11px] leading-5 text-[color:var(--keel-ink-4)]">
        Forecasts are what we expect; spend is what we&apos;ve tracked.
      </p>
    </section>
  );
}
