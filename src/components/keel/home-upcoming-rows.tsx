"use client";

import Link from "next/link";
import { useMemo } from "react";

import type { IncomeView, ProjectionEventView } from "@/lib/types";
import { cn, formatAud, formatDisplayDate } from "@/lib/utils";

import { SurfaceCard } from "@/components/keel/primitives";

function incomeIdFromEventId(eventId: string): string | null {
  if (!eventId.startsWith("income-")) return null;
  const match = eventId.match(/^income-(.+)-(\d{4}-\d{2}-\d{2})$/);
  return match?.[1] ?? null;
}

function sectionLabel(title: string) {
  return (
    <div className="px-3 pb-2 pt-3">
      <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-[color:var(--keel-ink-5)]">
        {title}
      </p>
    </div>
  );
}

function Row({
  href,
  dateIso,
  name,
  meta,
  amount,
  kind,
}: {
  href: string;
  dateIso: string;
  name: string;
  meta: string;
  amount: number;
  kind: "inflow" | "outflow";
}) {
  const date = formatDisplayDate(dateIso, "short").toUpperCase();
  const amountCopy = `${kind === "inflow" ? "+" : "-"}${formatAud(Math.abs(amount))}`;
  const amountClass =
    kind === "inflow" ? "text-[color:var(--keel-safe-soft)]" : "text-[color:var(--keel-ink-3)]";

  return (
    <Link
      href={href}
      className={cn(
        "grid grid-cols-[56px_1fr_auto] items-center gap-3 px-3 py-2.5",
        "border-b border-white/[0.04] no-underline text-inherit transition-opacity hover:opacity-90",
      )}
    >
      <div className="text-[10px] font-medium tabular-nums tracking-[0.04em] text-[color:var(--keel-ink-5)]">
        {date}
      </div>
      <div className="min-w-0">
        <p className="truncate text-[13px] font-medium text-[color:var(--keel-ink)]">{name}</p>
        <p className="mt-0.5 truncate text-[11px] text-[color:var(--keel-ink-4)]">{meta}</p>
      </div>
      <div className={cn("font-mono text-[13px] font-medium tabular-nums", amountClass)}>{amountCopy}</div>
    </Link>
  );
}

export function HomeUpcomingRows({
  incomes,
  timeline,
  maxBills = 6,
}: {
  incomes: IncomeView[];
  timeline: ProjectionEventView[];
  maxBills?: number;
}) {
  const incomeById = useMemo(() => new Map(incomes.map((i) => [i.id, i])), [incomes]);

  const nextPayRows = useMemo(() => {
    const out: Array<{ event: ProjectionEventView; income: IncomeView }> = [];
    const seen = new Set<string>();

    for (const event of timeline) {
      if (event.type !== "income" || event.isSkipped) continue;
      const incomeId = incomeIdFromEventId(event.id);
      if (!incomeId || seen.has(incomeId)) continue;
      const income = incomeById.get(incomeId);
      if (!income) continue;
      seen.add(incomeId);
      out.push({ event, income });
    }

    return out;
  }, [incomeById, timeline]);

  const upcomingBills = useMemo(
    () => timeline.filter((e) => e.type === "bill").slice(0, Math.max(0, maxBills)),
    [maxBills, timeline],
  );

  return (
    <div className="mt-4 space-y-4">
      <SurfaceCard className="!p-0 overflow-hidden">
        {sectionLabel("Upcoming pay")}
        <div>
          {nextPayRows.length === 0 ? (
            <div className="px-3 pb-3 text-sm text-[color:var(--keel-ink-3)]">No pay events yet.</div>
          ) : (
            nextPayRows.map(({ event, income }) => (
              <Row
                key={event.id}
                href={`/incomes/${income.id}`}
                dateIso={event.isoDate ?? event.date}
                name={income.name}
                meta={income.frequency.toLowerCase()}
                amount={event.amount}
                kind="inflow"
              />
            ))
          )}
        </div>
      </SurfaceCard>

      <SurfaceCard className="!p-0 overflow-hidden">
        {sectionLabel("Upcoming events")}
        <div>
          {upcomingBills.length === 0 ? (
            <div className="px-3 pb-3 text-sm text-[color:var(--keel-ink-3)]">
              No upcoming commitments yet.
            </div>
          ) : (
            upcomingBills.map((event) => (
              <Row
                key={event.id}
                href={event.commitmentId ? `/commitments/${event.commitmentId}` : "/commitments"}
                dateIso={event.isoDate ?? event.date}
                name={event.label}
                meta="due"
                amount={event.amount}
                kind="outflow"
              />
            ))
          )}
        </div>
      </SurfaceCard>
    </div>
  );
}

