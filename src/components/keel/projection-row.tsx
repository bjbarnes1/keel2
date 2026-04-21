"use client";

/**
 * Single projection event row (home + timeline lists): amount, balance hint, skip affordances.
 *
 * Client Component: may render as `Link` to commitment/income edit routes when not in
 * interactive skip-restore mode.
 *
 * @module components/keel/projection-row
 */

import { ArrowDown, ArrowUp } from "lucide-react";
import Link from "next/link";

import type { ProjectionEventView } from "@/lib/types";
import { cn, formatAud } from "@/lib/utils";

function projectionEventDetailHref(event: ProjectionEventView): string | undefined {
  if (event.type === "income") {
    if (!event.id.startsWith("income-")) {
      return undefined;
    }
    const iso = event.isoDate;
    if (iso && event.id.endsWith(`-${iso}`)) {
      const incomeId = event.id.slice("income-".length, -(iso.length + 1));
      return incomeId ? `/settings/incomes/${incomeId}/edit` : undefined;
    }
    const match = event.id.match(/^income-(.+)-(\d{4}-\d{2}-\d{2})$/);
    return match?.[1] ? `/settings/incomes/${match[1]}/edit` : undefined;
  }
  if (event.type === "bill" && event.commitmentId) {
    return `/commitments/${event.commitmentId}`;
  }
  return undefined;
}

export function ProjectionRow({
  event,
  onSkippedBillActivate,
}: {
  event: ProjectionEventView;
  /** When set, skipped bill rows become tappable to open restore. */
  onSkippedBillActivate?: () => void;
}) {
  const isIncome = event.type === "income";
  const projected = event.projectedAvailableMoney ?? 0;
  const isAttention = Boolean(event.isAttention);
  const isNextPayIncome = Boolean(event.isNextPayIncome);
  const isSkipped = Boolean(event.isSkipped);
  const isSpreadTarget = Boolean(event.isSkipSpreadTarget);
  const showAmount = typeof event.displayAmount === "number" ? event.displayAmount : event.amount;
  const projectedClassName = isAttention
    ? "text-[color:var(--keel-attend)]"
    : projected < 0
      ? "text-[color:var(--keel-ink-3)]"
      : projected < 500
        ? "text-[color:var(--keel-ink-3)]"
        : "text-muted-foreground";

  const interactiveSkipped =
    !isIncome && isSkipped && typeof event.skipId === "string" && Boolean(onSkippedBillActivate);

  const detailHref = !interactiveSkipped ? projectionEventDetailHref(event) : undefined;

  const inner = (
    <>
      <div
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-full",
          isIncome ? "bg-emerald-500/10 text-emerald-500" : "bg-white/5 text-[color:var(--keel-ink-3)]",
        )}
      >
        {isIncome ? <ArrowDown className="h-4 w-4" /> : <ArrowUp className="h-4 w-4" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-medium">{event.label}</p>
          {isSkipped ? (
            <span className="glass-tint-attend rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[color:var(--keel-attend)]">
              Skipped
            </span>
          ) : null}
          {isSpreadTarget && !isSkipped ? (
            <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-500/90">
              Catch-up
            </span>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">{event.date}</p>
        {isAttention && typeof event.attentionReserved === "number" ? (
          <p className="mt-1 text-xs text-[color:var(--keel-attend)]">
            Holding {formatAud(event.attentionReserved)} of {formatAud(event.amount)}
          </p>
        ) : null}
      </div>
      <div className="text-right">
        <p
          className={cn(
            "font-mono text-sm font-semibold",
            isIncome ? "text-emerald-500" : "text-foreground",
            isSkipped && !isIncome ? "line-through decoration-[color:var(--keel-attend)]/70" : null,
          )}
        >
          {isIncome ? "+" : "-"}
          {formatAud(showAmount)}
        </p>
        <p className={cn("font-mono text-xs", projectedClassName)}>{formatAud(projected)}</p>
      </div>
    </>
  );

  const rowClass = cn(
    "flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-3 text-left",
    isSkipped ? "opacity-[0.6]" : null,
    isAttention ? "glass-tint-attend" : isNextPayIncome ? "glass-tint-safe" : "glass-clear",
    interactiveSkipped ? "cursor-pointer transition-opacity hover:opacity-90" : null,
  );

  if (interactiveSkipped) {
    return (
      <button type="button" className={cn(rowClass, "w-full")} onClick={onSkippedBillActivate}>
        {inner}
      </button>
    );
  }

  if (detailHref) {
    return (
      <Link
        href={detailHref}
        className={cn(rowClass, "block w-full no-underline text-inherit transition-opacity hover:opacity-90")}
      >
        {inner}
      </Link>
    );
  }

  return <div className={rowClass}>{inner}</div>;
}
