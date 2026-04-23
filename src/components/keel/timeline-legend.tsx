"use client";

/**
 * Scrollable event list paired with the Waterline chart. Three sections:
 *   1. Today — rows visible for today's events, highlighted tint
 *   2. Upcoming — future events, fading with distance from focal
 *   3. Earlier — past events, collapsed by default
 *
 * Sync contract:
 *   - Tap a row → `onRowTap(rowDate)` scrubs the chart to that date.
 *   - Scroll → the row whose top is closest to the container's top is
 *     reported via `onScroll(topDate)` (debounced 250ms after the last tick).
 *   - When `source === "chart"` and focalDate changes, scroll the legend so
 *     the row for focalDate sits at the top; in that window the scroll-emit
 *     lockout prevents the legend from echoing the change back.
 *   - Currently-focal row gets a momentary sea-green glow (CSS, 1s) when the
 *     chart just set the focal date, telling the user "that's the event at
 *     the Now line right now".
 *
 * @module components/keel/timeline-legend
 */

import { useEffect, useMemo, useRef, useState } from "react";

import type { ProjectionEvent } from "@/lib/engine/keel";
import type { SyncSource } from "@/lib/hooks/use-timeline-sync";
import { toIsoDate } from "@/lib/timeline/waterline-geometry";
import { cn, formatAud, formatDisplayDate } from "@/lib/utils";

const SCROLL_SETTLE_MS = 250;

function opacityForUpcoming(iso: string, focalIso: string): number {
  const target = new Date(`${iso}T00:00:00Z`).getTime();
  const focal = new Date(`${focalIso}T00:00:00Z`).getTime();
  const days = Math.abs(target - focal) / 86_400_000;
  if (days > 28) return 0.5;
  if (days > 14) return 0.75;
  return 1;
}

function formatShortCaps(iso: string): string {
  return formatDisplayDate(iso, "short").toUpperCase();
}

export type TimelineLegendProps = {
  allEvents: ProjectionEvent[];
  focalDate: Date;
  todayDate: Date;
  syncSource: SyncSource;
  onRowTap: (date: Date) => void;
  onScroll: (topDate: Date) => void;
};

export function TimelineLegend({
  allEvents,
  focalDate,
  todayDate,
  syncSource,
  onRowTap,
  onScroll,
}: TimelineLegendProps) {
  const todayIso = toIsoDate(todayDate);
  const focalIso = toIsoDate(focalDate);

  const { todays, upcoming, earlier } = useMemo(() => {
    const todays: ProjectionEvent[] = [];
    const upcoming: ProjectionEvent[] = [];
    const earlier: ProjectionEvent[] = [];
    for (const event of allEvents) {
      if (event.date === todayIso) todays.push(event);
      else if (event.date > todayIso) upcoming.push(event);
      else earlier.push(event);
    }
    // Upcoming: ascending by date. Earlier: descending (most recent first).
    upcoming.sort((a, b) => a.date.localeCompare(b.date));
    earlier.sort((a, b) => b.date.localeCompare(a.date));
    return { todays, upcoming, earlier };
  }, [allEvents, todayIso]);

  const [earlierExpanded, setEarlierExpanded] = useState(false);

  // --- Scroll → focal reporting --------------------------------------------

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const rowRefs = useRef(new Map<string, HTMLElement | null>());
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressEmitRef = useRef(false);

  useEffect(() => {
    return () => {
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    };
  }, []);

  const handleScroll = () => {
    if (suppressEmitRef.current) return;
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    settleTimerRef.current = setTimeout(() => {
      const container = scrollRef.current;
      if (!container) return;
      const containerTop = container.getBoundingClientRect().top;
      let closestIso: string | null = null;
      let closestDelta = Number.POSITIVE_INFINITY;
      for (const [iso, node] of rowRefs.current) {
        if (!node) continue;
        const rect = node.getBoundingClientRect();
        const delta = rect.top - containerTop;
        if (delta < -20) continue; // row is above the viewport
        if (Math.abs(delta) < Math.abs(closestDelta)) {
          closestDelta = delta;
          closestIso = iso;
        }
      }
      if (closestIso) {
        onScroll(new Date(`${closestIso}T00:00:00Z`));
      }
    }, SCROLL_SETTLE_MS);
  };

  // --- Chart → legend auto-scroll ------------------------------------------

  // When the chart drove the update, scroll the legend so the focal row lands
  // near the top. Suppress the legend's own scroll emit for a beat so it
  // doesn't echo right back.
  useEffect(() => {
    if (syncSource !== "chart") return;
    const container = scrollRef.current;
    if (!container) return;

    // Find the row whose date is >= focalIso (upcoming) or == today; fallback
    // to the closest earlier row when focal is in the past.
    const candidate = pickRowForDate(rowRefs.current, focalIso);
    if (!candidate) return;

    suppressEmitRef.current = true;
    const node = rowRefs.current.get(candidate);
    if (node) {
      const containerRect = container.getBoundingClientRect();
      const nodeRect = node.getBoundingClientRect();
      // Instant assignment avoids queued smooth scrolls stacking up during continuous
      // chart drags, which would cause visible jitter in the legend.
      container.scrollTop += nodeRect.top - containerRect.top - 8;
    }
    const releaseId = setTimeout(() => {
      suppressEmitRef.current = false;
    }, 400);
    return () => clearTimeout(releaseId);
  }, [focalIso, syncSource]);

  const registerRow = (iso: string) => (node: HTMLElement | null) => {
    if (node) rowRefs.current.set(iso, node);
    else rowRefs.current.delete(iso);
  };

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      className="hide-scrollbar overflow-y-auto"
      // ~10 rows × 40px each; caps the legend so it doesn't fill the whole screen
      // and makes the scroll container bounded so auto-scroll and scroll→chart sync work.
      style={{ WebkitOverflowScrolling: "touch", maxHeight: 400 }}
    >
      {todays.length > 0 ? (
        <section className="mb-4">
          <p className="label-upper mb-2 px-1 pt-1">
            Today · {formatDisplayDate(todayIso, "long")}
          </p>
          <div className="space-y-1">
            {todays.map((event) => (
              <LegendRow
                key={event.id}
                event={event}
                iso={event.date}
                isToday
                isFocal={event.date === focalIso}
                isHighlighted={syncSource === "chart" && event.date === focalIso}
                registerRef={registerRow(event.date)}
                onTap={() => onRowTap(new Date(`${event.date}T00:00:00Z`))}
              />
            ))}
          </div>
        </section>
      ) : null}

      <section className="mb-4">
        <p className="label-upper mb-2 px-1 pt-1">Upcoming</p>
        <div>
          {upcoming.length === 0 ? (
            <p className="px-2 py-3 text-[13px] text-[color:var(--keel-ink-4)]">
              Nothing scheduled after today in the loaded window.
            </p>
          ) : (
            upcoming.map((event, idx) => (
              <LegendRow
                key={event.id}
                event={event}
                iso={event.date}
                focalIso={focalIso}
                isFocal={event.date === focalIso}
                isHighlighted={syncSource === "chart" && event.date === focalIso}
                showDivider={idx !== upcoming.length - 1}
                registerRef={registerRow(event.date)}
                onTap={() => onRowTap(new Date(`${event.date}T00:00:00Z`))}
              />
            ))
          )}
        </div>
      </section>

      {earlier.length > 0 ? (
        <section className="mb-4">
          <button
            type="button"
            className="label-upper mb-2 flex w-full items-center justify-between px-1 py-1 text-left"
            onClick={() => setEarlierExpanded((prev) => !prev)}
            aria-expanded={earlierExpanded}
          >
            <span>Earlier</span>
            <span className="text-[10px] text-[color:var(--keel-ink-4)]">
              {earlierExpanded ? "HIDE" : `${earlier.length} shown`}
            </span>
          </button>
          {earlierExpanded ? (
            <div className="opacity-60">
              {earlier.map((event, idx) => (
                <LegendRow
                  key={event.id}
                  event={event}
                  iso={event.date}
                  focalIso={focalIso}
                  isFocal={event.date === focalIso}
                  isHighlighted={syncSource === "chart" && event.date === focalIso}
                  showDivider={idx !== earlier.length - 1}
                  registerRef={registerRow(event.date)}
                  onTap={() => onRowTap(new Date(`${event.date}T00:00:00Z`))}
                />
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      <style>{`
        @keyframes keel-legend-glow {
          0% { box-shadow: 0 0 0 0 color-mix(in oklab, var(--keel-safe-soft), transparent 60%); }
          50% { box-shadow: 0 0 0 2px color-mix(in oklab, var(--keel-safe-soft), transparent 60%); }
          100% { box-shadow: 0 0 0 0 color-mix(in oklab, var(--keel-safe-soft), transparent 100%); }
        }
        .keel-legend-highlight {
          animation: keel-legend-glow 1s ease-out;
          border-radius: 6px;
        }
        @media (prefers-reduced-motion: reduce) {
          .keel-legend-highlight {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}

function pickRowForDate(
  rows: Map<string, HTMLElement | null>,
  focalIso: string,
): string | null {
  let bestForward: { iso: string; id: string } | null = null;
  let bestBackward: { iso: string; id: string } | null = null;
  for (const [id, node] of rows) {
    if (!node) continue;
    const iso = node.dataset.iso;
    if (!iso) continue;
    if (iso >= focalIso) {
      if (!bestForward || iso < bestForward.iso) bestForward = { iso, id };
    } else if (iso < focalIso) {
      if (!bestBackward || iso > bestBackward.iso) bestBackward = { iso, id };
    }
  }
  return bestForward?.id ?? bestBackward?.id ?? null;
}

// --- Row ---------------------------------------------------------------------

type LegendRowProps = {
  event: ProjectionEvent;
  iso: string;
  focalIso?: string;
  isToday?: boolean;
  isFocal: boolean;
  isHighlighted: boolean;
  showDivider?: boolean;
  registerRef: (node: HTMLElement | null) => void;
  onTap: () => void;
};

function LegendRow({
  event,
  iso,
  focalIso,
  isToday,
  isHighlighted,
  showDivider,
  registerRef,
  onTap,
}: LegendRowProps) {
  const isIncome = event.type === "income";
  const signPrefix = isIncome ? "+" : "−";
  const amountColor = isIncome ? "var(--keel-safe-soft)" : "var(--keel-ink-3)";
  const rowOpacity = isToday ? 1 : opacityForUpcoming(iso, focalIso ?? iso);

  return (
    <button
      ref={(node) => registerRef(node)}
      type="button"
      data-iso={iso}
      onClick={onTap}
      className={cn(
        "grid w-full items-center gap-3 px-2 py-[10px] text-left",
        isToday
          ? "rounded-r-md border-l-[1.5px]"
          : showDivider
            ? "border-b-[0.5px]"
            : undefined,
        isHighlighted ? "keel-legend-highlight" : undefined,
      )}
      style={{
        gridTemplateColumns: "56px 1fr auto",
        opacity: rowOpacity,
        borderLeftColor: isToday ? "var(--keel-safe-soft)" : undefined,
        background: isToday ? "color-mix(in srgb, var(--keel-safe-soft) 12%, transparent)" : undefined,
        borderBottomColor: showDivider ? "rgba(255,255,255,0.04)" : undefined,
      }}
    >
      <span
        className="tabular-nums"
        style={{
          fontSize: 10,
          fontWeight: 500,
          letterSpacing: "0.06em",
          color: isToday ? "var(--keel-safe-soft)" : "var(--keel-ink-5)",
        }}
      >
        {isToday ? "TODAY" : formatShortCaps(iso)}
      </span>
      <span
        className="min-w-0 truncate"
        style={{ fontSize: 13, color: "var(--keel-ink)" }}
      >
        {event.label}
      </span>
      <span
        className="tabular-nums"
        style={{
          fontSize: 13,
          fontWeight: 500,
          color: amountColor,
        }}
      >
        {signPrefix}
        {formatAud(Math.abs(event.amount))}
      </span>
    </button>
  );
}
