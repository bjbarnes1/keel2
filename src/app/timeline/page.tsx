import { AppShell } from "@/components/keel/primitives";
import { TimelineView } from "@/components/keel/timeline-view";
import { getDashboardSnapshot } from "@/lib/persistence/keel-store";

export const dynamic = "force-dynamic";

export default async function TimelinePage() {
  const snapshot = await getDashboardSnapshot();

  const hasAnyScheduledEvents =
    snapshot.incomes.some((income) => Boolean(income.nextPayDateIso)) ||
    snapshot.commitments.some((commitment) => Boolean(commitment.nextDueDateIso));

  const attentionCommitmentIds = snapshot.commitments
    .filter((commitment) => commitment.isAttention)
    .map((commitment) => commitment.id);

  const header = (
    <span className="keel-chip px-3 py-1 text-[11px] font-medium text-[color:var(--keel-ink-3)]">
      14 days
    </span>
  );

  return (
    <AppShell title="Timeline" currentPath="/timeline" headerRight={header}>
      <TimelineView
        startingAvailableMoney={snapshot.availableMoney}
        attentionCommitmentIds={attentionCommitmentIds}
        hasAnyScheduledEvents={hasAnyScheduledEvents}
        annualTotals={{
          annualIncomeForecast: snapshot.annualIncomeForecast,
          annualCommitmentsForecast: snapshot.annualCommitmentsForecast,
          annualSpendActualToDate: snapshot.annualSpendActualToDate,
        }}
      />
    </AppShell>
  );
}
