import { TimelineFortnightRows } from "@/components/keel/timeline-fortnight-rows";
import { WaterlineTimeline } from "@/components/keel/waterline-timeline";
import { AppShell } from "@/components/keel/primitives";
import { getCurrentPayPeriod } from "@/lib/engine/keel";
import { getDashboardSnapshot } from "@/lib/persistence/keel-store";
import type { CommitmentFrequency, PayFrequency } from "@/lib/types";
import { formatAud } from "@/lib/utils";

export const dynamic = "force-dynamic";

function parseIsoDate(iso: string) {
  return new Date(`${iso}T00:00:00Z`);
}

function addCycle(date: Date, frequency: CommitmentFrequency | PayFrequency) {
  const next = new Date(date);
  switch (frequency) {
    case "weekly":
      next.setUTCDate(next.getUTCDate() + 7);
      return next;
    case "fortnightly":
      next.setUTCDate(next.getUTCDate() + 14);
      return next;
    case "monthly":
      next.setUTCMonth(next.getUTCMonth() + 1);
      return next;
    case "quarterly":
      next.setUTCMonth(next.getUTCMonth() + 3);
      return next;
    case "annual":
      next.setUTCFullYear(next.getUTCFullYear() + 1);
      return next;
    default:
      return next;
  }
}

function subtractCycle(date: Date, frequency: CommitmentFrequency | PayFrequency) {
  const prev = new Date(date);
  switch (frequency) {
    case "weekly":
      prev.setUTCDate(prev.getUTCDate() - 7);
      return prev;
    case "fortnightly":
      prev.setUTCDate(prev.getUTCDate() - 14);
      return prev;
    case "monthly":
      prev.setUTCMonth(prev.getUTCMonth() - 1);
      return prev;
    case "quarterly":
      prev.setUTCMonth(prev.getUTCMonth() - 3);
      return prev;
    case "annual":
      prev.setUTCFullYear(prev.getUTCFullYear() - 1);
      return prev;
    default:
      return prev;
  }
}

function formatShortDateFromIso(iso: string) {
  return new Intl.DateTimeFormat("en-AU", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(parseIsoDate(iso));
}

export default async function TimelinePage() {
  const snapshot = await getDashboardSnapshot();

  const asOf = parseIsoDate(snapshot.balanceAsOfIso);

  const primaryIncome = snapshot.incomes.find((income) => income.id === snapshot.primaryIncomeId) ?? null;
  const payPeriod = getCurrentPayPeriod(
    primaryIncome && primaryIncome.nextPayDateIso
      ? {
          id: primaryIncome.id,
          name: primaryIncome.name,
          amount: primaryIncome.amount,
          frequency: primaryIncome.frequency,
          nextPayDate: primaryIncome.nextPayDateIso,
        }
      : null,
    asOf,
  );

  const windowStartIso = payPeriod.start.toISOString().slice(0, 10);
  const windowEnd = new Date(payPeriod.start);
  windowEnd.setUTCDate(windowEnd.getUTCDate() + 42);
  const windowEndInclusive = new Date(windowEnd);
  windowEndInclusive.setUTCDate(windowEndInclusive.getUTCDate() - 1);
  const windowEndInclusiveIso = windowEndInclusive.toISOString().slice(0, 10);

  const waterlineIncomes = snapshot.incomes
    .filter((income) => Boolean(income.nextPayDateIso))
    .map((income) => ({
      id: income.id,
      name: income.name,
      amount: income.amount,
      frequency: income.frequency,
      nextPayDateIso: income.nextPayDateIso!,
      isPrimary: income.id === snapshot.primaryIncomeId,
    }));

  const waterlineCommitments = snapshot.commitments
    .filter((commitment) => Boolean(commitment.nextDueDateIso))
    .map((commitment) => ({
      id: commitment.id,
      name: commitment.name,
      amount: commitment.amount,
      frequency: commitment.frequency,
      nextDueDateIso: commitment.nextDueDateIso!,
      isAttention: commitment.isAttention,
    }));

  const skippedOccurrenceKeys = new Set(
    snapshot.commitmentSkipsActive.map((row) => `${row.commitmentId}:${row.originalDateIso}`),
  );

  // 42-day cash window totals (scheduled occurrences within [start, end)).
  const windowStart = payPeriod.start;
  const windowEndExclusive = windowEnd;

  let scheduledIncome = 0;
  let payDays = 0;
  for (const income of waterlineIncomes) {
    let cursor = parseIsoDate(income.nextPayDateIso);
    while (cursor < windowStart) {
      cursor = addCycle(cursor, income.frequency);
    }
    while (true) {
      const prev = subtractCycle(cursor, income.frequency);
      if (prev < windowStart) {
        break;
      }
      cursor = prev;
    }

    while (cursor < windowEndExclusive) {
      if (cursor >= windowStart) {
        scheduledIncome += income.amount;
        payDays += 1;
      }
      cursor = addCycle(cursor, income.frequency);
    }
  }

  let scheduledCommitments = 0;
  for (const commitment of waterlineCommitments) {
    let due = parseIsoDate(commitment.nextDueDateIso);
    while (due < windowStart) {
      due = addCycle(due, commitment.frequency);
    }
    while (true) {
      const prev = subtractCycle(due, commitment.frequency);
      if (prev < windowStart) {
        break;
      }
      due = prev;
    }

    while (due < windowEndExclusive) {
      if (due >= windowStart) {
        scheduledCommitments += commitment.amount;
      }
      due = addCycle(due, commitment.frequency);
    }
  }

  const signedSurplus = scheduledIncome - scheduledCommitments;

  const timelineEvents = snapshot.timeline
    .filter((event) => Boolean(event.isoDate))
    .filter((event) => {
      const d = parseIsoDate(event.isoDate!);
      return d >= windowStart && d < windowEndExclusive;
    })
    .slice()
    .sort((left, right) => left.isoDate!.localeCompare(right.isoDate!));

  const fortnightLabel = (index: number) => {
    const start = new Date(windowStart);
    start.setUTCDate(start.getUTCDate() + index * 14);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 13);
    return `${formatShortDateFromIso(start.toISOString().slice(0, 10))} – ${formatShortDateFromIso(
      end.toISOString().slice(0, 10),
    )}`;
  };

  const groups = new Map<number, typeof timelineEvents>();
  for (const event of timelineEvents) {
    const day = Math.floor((parseIsoDate(event.isoDate!).getTime() - windowStart.getTime()) / 86400000);
    const idx = Math.min(2, Math.max(0, Math.floor(day / 14)));
    const existing = groups.get(idx) ?? [];
    existing.push(event);
    groups.set(idx, existing);
  }

  const fortnightSections = [0, 1, 2].map((idx) => {
    const opacity = idx === 0 ? 1 : idx === 1 ? 0.75 : 0.55;
    return {
      idx,
      opacity,
      label: fortnightLabel(idx),
      rows: groups.get(idx) ?? [],
    };
  });

  return (
    <AppShell title="Timeline" currentPath="/timeline">
      <div className="relative">
        <div className="absolute right-0 top-0">
          <span className="keel-chip px-3 py-1 text-[11px] font-medium text-[color:var(--keel-ink-3)]">6 weeks</span>
        </div>

        <WaterlineTimeline
          asOfIso={snapshot.balanceAsOfIso}
          windowStartIso={windowStartIso}
          incomes={waterlineIncomes}
          commitments={waterlineCommitments}
          skippedOccurrenceKeys={skippedOccurrenceKeys}
        />
      </div>

      <section className="glass-clear mt-4 rounded-[var(--radius-md)] p-4">
        <p className="label-upper">Through {formatShortDateFromIso(windowEndInclusiveIso)}</p>
        <p className="mt-2 text-sm text-[color:var(--keel-ink-2)]">
          {snapshot.commitments.length} commitments · {payDays} pay days ·{" "}
          <span className="font-mono tabular-nums text-[color:var(--keel-ink)]">{formatAud(signedSurplus)}</span>{" "}
          <span className="text-[color:var(--keel-ink-3)]">surplus</span>
        </p>
      </section>

      <section className="glass-clear mt-4 rounded-[var(--radius-md)] p-4">
        <div className="grid grid-cols-3 gap-3">
          <div>
            <p className="text-[11px] font-medium text-[color:var(--keel-ink-3)]">Annual income (forecast)</p>
            <p className="mt-2 font-mono text-sm tabular-nums text-[color:var(--keel-ink)]">
              {formatAud(snapshot.annualIncomeForecast)}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-medium text-[color:var(--keel-ink-3)]">Annual commitments (forecast)</p>
            <p className="mt-2 font-mono text-sm tabular-nums text-[color:var(--keel-ink)]">
              {formatAud(snapshot.annualCommitmentsForecast)}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-medium text-[color:var(--keel-ink-3)]">
              Spend allocated to commitments (last 12 months)
            </p>
            <p className="mt-2 font-mono text-sm tabular-nums text-[color:var(--keel-ink)]">
              {formatAud(snapshot.annualSpendActualToDate)}
            </p>
          </div>
        </div>
        <p className="mt-3 text-[11px] leading-5 text-[color:var(--keel-ink-4)]">
          Forecasts are what we expect; spend is what we&apos;ve tracked.
        </p>
      </section>

      <TimelineFortnightRows sections={fortnightSections} />
    </AppShell>
  );
}
