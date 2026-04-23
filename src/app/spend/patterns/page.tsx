/**
 * Patterns — human-readable view over the Layer B learned patterns.
 *
 * Reads `UserLearnedPatterns` via `loadLayerB()` and surfaces:
 *   - Category drift (budgeted vs actual, sorted by over-budget severity)
 *   - Seasonal variance (peaks and troughs Claude has observed)
 *   - Cashflow tendencies (typical end-of-cycle remaining, variance, skips)
 *
 * The same data powers Ask Keel's grounded answers — making it visible here gives the
 * user a direct "what does Keel know about my spending?" surface. Includes a
 * `PatternsRefreshButton` for triggering the deterministic analyser on demand.
 *
 * @module app/spend/patterns/page
 */

import Link from "next/link";

import { AppShell, SectionTitle, SurfaceCard } from "@/components/keel/primitives";
import { PatternsRefreshButton } from "@/components/keel/patterns-refresh-button";
import { loadLayerB } from "@/lib/ai/context/generators/load-layer-b";
import type { LayerB } from "@/lib/ai/context/schemas/layer-b-schema";
import { formatAud } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Patterns · Keel",
  description: "What Keel has learned from your spending history.",
};

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function formatMonthList(months: number[]): string {
  return months.map((m) => MONTH_LABELS[m - 1] ?? String(m)).join(", ");
}

function confidenceChip(confidence: string) {
  const tone =
    confidence === "high"
      ? "border-[color:var(--keel-safe-soft)]/30 text-[color:var(--keel-safe-soft)]"
      : confidence === "medium"
        ? "border-white/15 text-[color:var(--keel-ink-3)]"
        : "border-white/10 text-[color:var(--keel-ink-4)]";
  return (
    <span
      className={`rounded-full border px-2 py-[2px] text-[10px] font-medium uppercase tracking-[0.12em] ${tone}`}
    >
      {confidence}
    </span>
  );
}

function Empty({ layerB }: { layerB: LayerB }) {
  return (
    <SurfaceCard>
      <p className="text-sm text-[color:var(--keel-ink-3)]">
        Keel hasn&apos;t spotted patterns yet.{" "}
        {layerB.patterns.meta.totalTransactionsAnalyzed > 0
          ? "Not enough history in any category to be confident."
          : "Import or reconcile some transactions, then refresh."}
      </p>
      <p className="mt-3 text-xs text-[color:var(--keel-ink-4)]">
        Patterns are computed deterministically from your transaction history — no AI
        involved at this step.
      </p>
    </SurfaceCard>
  );
}

export default async function PatternsPage() {
  const layerB = await loadLayerB();
  const { patterns, lastAnalyzedAt, analysisCoveringFrom, analysisCoveringTo, isEmpty } = layerB;

  const driftOverBudget = [...patterns.categoryDrift]
    .filter((d) => d.driftPercent > 0)
    .sort((a, b) => b.driftPercent - a.driftPercent);
  const driftUnderBudget = [...patterns.categoryDrift]
    .filter((d) => d.driftPercent <= 0)
    .sort((a, b) => a.driftPercent - b.driftPercent);

  const hasDrift = patterns.categoryDrift.length > 0;
  const hasSeasonal = patterns.seasonalVariance.length > 0;
  const tendencies = patterns.cashflowTendencies;

  return (
    <AppShell title="Patterns" currentPath="/spend" backHref="/spend">
      <div className="flex flex-col gap-3">
        <p className="text-[13px] text-[color:var(--keel-ink-3)]">
          What Keel has learned from your transaction history — the same signals that
          ground Ask Keel&apos;s answers to &ldquo;how do I usually…?&rdquo; questions.
        </p>

        <div className="glass-clear flex items-center justify-between gap-3 rounded-[var(--radius-md)] px-4 py-3">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-[color:var(--keel-ink-4)]">
              Last analysed
            </p>
            <p className="mt-1 text-sm text-[color:var(--keel-ink)]">
              {lastAnalyzedAt ? new Date(lastAnalyzedAt).toLocaleString("en-AU") : "Never"}
            </p>
            {analysisCoveringFrom && analysisCoveringTo ? (
              <p className="mt-1 text-[11px] text-[color:var(--keel-ink-4)]">
                Window: {analysisCoveringFrom} → {analysisCoveringTo}
              </p>
            ) : null}
          </div>
          <PatternsRefreshButton />
        </div>
      </div>

      {isEmpty ? (
        <>
          <SectionTitle title="Patterns" />
          <Empty layerB={layerB} />
        </>
      ) : null}

      {hasDrift ? (
        <>
          <SectionTitle title="Category drift" />
          {driftOverBudget.length > 0 ? (
            <div className="space-y-2">
              {driftOverBudget.map((d) => (
                <SurfaceCard key={d.categoryId} className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium text-[color:var(--keel-ink)]">
                        {d.categoryName}
                      </p>
                      {confidenceChip(d.confidence)}
                    </div>
                    <p className="mt-1 text-[11px] text-[color:var(--keel-ink-4)]">
                      {formatAud(d.actualMonthlyAverage)}/mo actual vs {formatAud(d.budgetedMonthly)}/mo budget · {d.monthsObserved} months observed
                    </p>
                  </div>
                  <p className="shrink-0 font-mono text-sm font-semibold text-[color:var(--keel-attend)]">
                    +{Math.round(d.driftPercent)}%
                  </p>
                </SurfaceCard>
              ))}
            </div>
          ) : null}
          {driftUnderBudget.length > 0 ? (
            <>
              <p className="mt-3 text-[11px] font-medium uppercase tracking-[0.2em] text-[color:var(--keel-ink-4)]">
                Under budget
              </p>
              <div className="space-y-2">
                {driftUnderBudget.map((d) => (
                  <SurfaceCard key={d.categoryId} className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-medium text-[color:var(--keel-ink)]">
                          {d.categoryName}
                        </p>
                        {confidenceChip(d.confidence)}
                      </div>
                      <p className="mt-1 text-[11px] text-[color:var(--keel-ink-4)]">
                        {formatAud(d.actualMonthlyAverage)}/mo actual vs {formatAud(d.budgetedMonthly)}/mo budget · {d.monthsObserved} months observed
                      </p>
                    </div>
                    <p className="shrink-0 font-mono text-sm font-semibold text-[color:var(--keel-safe-soft)]">
                      {Math.round(d.driftPercent)}%
                    </p>
                  </SurfaceCard>
                ))}
              </div>
            </>
          ) : null}
        </>
      ) : null}

      {hasSeasonal ? (
        <>
          <SectionTitle title="Seasonal variance" />
          <div className="space-y-2">
            {patterns.seasonalVariance.map((v) => (
              <SurfaceCard key={v.categoryId} className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-medium text-[color:var(--keel-ink)]">
                    {v.categoryName}
                  </p>
                  {confidenceChip(v.confidence)}
                </div>
                {v.highMonths.length > 0 ? (
                  <p className="text-[12px] text-[color:var(--keel-ink-3)]">
                    Peaks in <span className="font-medium">{formatMonthList(v.highMonths)}</span>
                    {" — "}
                    {v.highMonthMultiplier.toFixed(2)}× typical spend
                  </p>
                ) : null}
                {v.lowMonths.length > 0 ? (
                  <p className="text-[12px] text-[color:var(--keel-ink-3)]">
                    Quieter in <span className="font-medium">{formatMonthList(v.lowMonths)}</span>
                    {" — "}
                    {v.lowMonthMultiplier.toFixed(2)}× typical spend
                  </p>
                ) : null}
              </SurfaceCard>
            ))}
          </div>
        </>
      ) : null}

      {tendencies.confidence !== "low" ||
      tendencies.typicalEndOfCycleRemaining !== 0 ||
      tendencies.skipCommitmentsPerQuarter !== 0 ? (
        <>
          <SectionTitle title="Cashflow tendencies" />
          <SurfaceCard className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[13px] text-[color:var(--keel-ink-2)]">
                Typical end-of-cycle remaining
              </p>
              <p className="font-mono text-sm font-medium text-[color:var(--keel-ink)]">
                {formatAud(tendencies.typicalEndOfCycleRemaining)}
              </p>
            </div>
            <div className="flex items-center justify-between gap-2">
              <p className="text-[13px] text-[color:var(--keel-ink-2)]">
                Variance over the last 6 cycles
              </p>
              <p className="font-mono text-sm font-medium text-[color:var(--keel-ink)]">
                {(tendencies.variancePctOverLast6Cycles * 100).toFixed(0)}%
              </p>
            </div>
            <div className="flex items-center justify-between gap-2">
              <p className="text-[13px] text-[color:var(--keel-ink-2)]">
                Skips per quarter
              </p>
              <p className="font-mono text-sm font-medium text-[color:var(--keel-ink)]">
                {tendencies.skipCommitmentsPerQuarter.toFixed(1)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <p className="text-[11px] uppercase tracking-[0.2em] text-[color:var(--keel-ink-4)]">
                Confidence
              </p>
              {confidenceChip(tendencies.confidence)}
            </div>
          </SurfaceCard>
        </>
      ) : null}

      <p className="mt-6 text-[11px] text-[color:var(--keel-ink-4)]">
        All patterns above are computed deterministically from your transaction history.
        No AI is involved in producing these numbers. Ask Keel uses them as context for
        grounded answers to &ldquo;how do I usually…&rdquo; questions.
      </p>

      <p className="mt-1 text-[11px] text-[color:var(--keel-ink-4)]">
        <Link className="underline" href="/spend">
          Back to Spend
        </Link>
      </p>
    </AppShell>
  );
}
