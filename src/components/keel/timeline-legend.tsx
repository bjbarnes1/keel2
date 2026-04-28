"use client";

/**
 * Timeline table surface (30-day window) with occurrence-date move controls.
 *
 * Each row represents a projected income or commitment occurrence. Users can move
 * dates by +/- one day or set a specific date, building a draft scenario before
 * confirming.
 *
 * @module components/keel/timeline-legend
 */

import { formatAud, formatDisplayDate } from "@/lib/utils";

import type { TimelineTableRow } from "@/lib/timeline/waterline-geometry";

export type TimelineLegendProps = {
  rows: TimelineTableRow[];
  windowStartIso: string;
  windowEndIso: string;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  canPrevMonth: boolean;
  canNextMonth: boolean;
  onMoveByDays: (row: TimelineTableRow, days: number) => void;
  onSetDate: (row: TimelineTableRow, isoDate: string) => void;
  draftCount: number;
  onUndoDraft: () => void;
  onConfirmDraft: () => void;
  isConfirming: boolean;
  error?: string | null;
};

export function TimelineLegend({
  rows,
  windowStartIso,
  windowEndIso,
  onPrevMonth,
  onNextMonth,
  canPrevMonth,
  canNextMonth,
  onMoveByDays,
  onSetDate,
  draftCount,
  onUndoDraft,
  onConfirmDraft,
  isConfirming,
  error,
}: TimelineLegendProps) {
  const windowLabel = `${formatDisplayDate(windowStartIso, "short")} - ${formatDisplayDate(
    windowEndIso,
    "short",
  )}`;

  return (
    <section className="glass-clear rounded-[var(--radius-md)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs text-[color:var(--keel-ink-4)]">Table window</p>
          <p className="mt-1 text-sm font-medium text-[color:var(--keel-ink)]">{windowLabel}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onPrevMonth}
            disabled={!canPrevMonth}
            className="rounded-[var(--radius-pill)] border border-[color:var(--color-border)] px-3 py-1.5 text-xs font-medium text-[color:var(--keel-ink)] disabled:cursor-not-allowed disabled:opacity-45"
          >
            Previous month
          </button>
          <button
            type="button"
            onClick={onNextMonth}
            disabled={!canNextMonth}
            className="rounded-[var(--radius-pill)] border border-[color:var(--color-border)] px-3 py-1.5 text-xs font-medium text-[color:var(--keel-ink)] disabled:cursor-not-allowed disabled:opacity-45"
          >
            Next month
          </button>
          <button
            type="button"
            onClick={onUndoDraft}
            disabled={draftCount === 0 || isConfirming}
            className="rounded-[var(--radius-pill)] border border-[color:var(--color-border)] px-3 py-1.5 text-xs font-medium text-[color:var(--keel-ink)] disabled:cursor-not-allowed disabled:opacity-45"
          >
            Undo changes
          </button>
          <button
            type="button"
            onClick={onConfirmDraft}
            disabled={draftCount === 0 || isConfirming}
            className="rounded-[var(--radius-pill)] bg-[#2f7fce] px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45"
          >
            {isConfirming ? "Saving..." : `Confirm scenario${draftCount > 0 ? ` (${draftCount})` : ""}`}
          </button>
        </div>
      </div>

      {error ? (
        <p className="mt-3 rounded-[var(--radius-sm)] bg-[color:color-mix(in oklab,var(--keel-attend-soft),transparent_75%)] px-3 py-2 text-xs text-[color:var(--keel-ink-2)]">
          {error}
        </p>
      ) : null}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="text-left text-[11px] uppercase tracking-wide text-[color:var(--keel-ink-4)]">
            <tr>
              <th className="px-2 py-2">Date</th>
              <th className="px-2 py-2">Type</th>
              <th className="px-2 py-2">Item</th>
              <th className="px-2 py-2 text-right">Amount</th>
              <th className="px-2 py-2 text-right">Closing balance</th>
              <th className="px-2 py-2">Move</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="px-2 py-6 text-[13px] text-[color:var(--keel-ink-4)]" colSpan={6}>
                  No projected transactions in this 30-day window.
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const isIncome = row.type === "income";
                const moved = row.originalDateIso && row.originalDateIso !== row.dateIso;
                const moveDisabled = !row.sourceKind || !row.sourceId || !row.originalDateIso;
                return (
                  <tr key={row.id} className="border-t border-[color:color-mix(in_oklab,var(--keel-ink),transparent_92%)]">
                    <td className="px-2 py-2">
                      <p className="font-mono text-xs text-[color:var(--keel-ink)]">{row.dateIso}</p>
                      {moved ? (
                        <p className="text-[11px] text-[color:var(--keel-ink-4)]">
                          from {row.originalDateIso}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-2 py-2">
                      <span
                        className="rounded-[var(--radius-pill)] px-2 py-1 text-[10px] font-semibold uppercase tracking-wide"
                        style={{
                          background: isIncome
                            ? "color-mix(in oklab, #2bbf9b, transparent 78%)"
                            : "color-mix(in oklab, #d76d45, transparent 78%)",
                          color: isIncome ? "#1e8f6a" : "#b1502e",
                        }}
                      >
                        {isIncome ? "Incoming" : "Outgoing"}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-[13px] text-[color:var(--keel-ink)]">{row.label}</td>
                    <td
                      className="px-2 py-2 text-right font-mono text-[13px]"
                      style={{ color: isIncome ? "#1e8f6a" : "#b1502e" }}
                    >
                      {isIncome ? "+" : "-"}
                      {formatAud(Math.abs(row.amount))}
                    </td>
                    <td className="px-2 py-2 text-right font-mono text-[13px] text-[color:var(--keel-ink)]">
                      {formatAud(row.projectedBankBalance)}
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onMoveByDays(row, -1)}
                          disabled={moveDisabled}
                          className="rounded-[var(--radius-pill)] border border-[color:var(--color-border)] px-2 py-1 text-[11px] text-[color:var(--keel-ink)] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          -1d
                        </button>
                        <button
                          type="button"
                          onClick={() => onMoveByDays(row, 1)}
                          disabled={moveDisabled}
                          className="rounded-[var(--radius-pill)] border border-[color:var(--color-border)] px-2 py-1 text-[11px] text-[color:var(--keel-ink)] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          +1d
                        </button>
                        <input
                          type="date"
                          value={row.dateIso}
                          disabled={moveDisabled}
                          onChange={(event) => onSetDate(row, event.currentTarget.value)}
                          className="rounded-[var(--radius-pill)] border border-[color:var(--color-border)] bg-transparent px-2 py-1 text-[11px] text-[color:var(--keel-ink)] disabled:cursor-not-allowed disabled:opacity-40"
                        />
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
