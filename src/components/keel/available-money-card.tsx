"use client";

/**
 * Pinned glass card that hovers at the top-center of the Waterline chart,
 * aligned with the Now line. Shows the projected Available Money at the
 * current focal date.
 *
 * Animation discipline:
 *   - Number and label change via crossfade (two stacked spans). No count-up;
 *     the value is honest.
 *   - 200ms cubic-bezier(0.32, 0.72, 0, 1) — matches --ease-snap in globals.
 *   - `prefers-reduced-motion` collapses to an instant swap.
 *
 * @module components/keel/available-money-card
 */

import { useEffect, useRef, useState } from "react";

import { formatAud } from "@/lib/utils";

const CROSSFADE_MS = 200;

function formatShortDate(date: Date): string {
  return date
    .toLocaleDateString("en-AU", {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    })
    .toUpperCase();
}

type Frame<T> = { key: string; value: T };

type CrossfadeState<T> = {
  incoming: Frame<T>;
  outgoing: Frame<T> | null;
  /** Bumped each transition so we can re-key the outgoing span to restart its fade animation. */
  cycle: number;
};

function useCrossfade<T>(key: string, value: T): CrossfadeState<T> {
  const [state, setState] = useState<CrossfadeState<T>>({
    incoming: { key, value },
    outgoing: null,
    cycle: 0,
  });
  const incomingRef = useRef(state.incoming);

  useEffect(() => {
    if (key === incomingRef.current.key) return;
    const previous = incomingRef.current;
    incomingRef.current = { key, value };
    setState((prev) => ({
      incoming: { key, value },
      outgoing: previous,
      cycle: prev.cycle + 1,
    }));
    const id = setTimeout(() => {
      setState((prev) => ({ incoming: prev.incoming, outgoing: null, cycle: prev.cycle }));
    }, CROSSFADE_MS);
    return () => clearTimeout(id);
  }, [key, value]);

  return state;
}

export type AvailableMoneyCardProps = {
  value: number;
  focalDate: Date;
  isTodayFocused: boolean;
};

export function AvailableMoneyCard({ value, focalDate, isTodayFocused }: AvailableMoneyCardProps) {
  const labelKey = isTodayFocused ? "today" : `on:${focalDate.toISOString()}`;
  const labelText = isTodayFocused ? "YOU HAVE" : `ON ${formatShortDate(focalDate)}`;
  const valueKey = `v:${value.toFixed(2)}`;
  const valueText = formatAud(value);
  const isNegative = value < 0;

  const labelFrames = useCrossfade(labelKey, labelText);
  const valueFrames = useCrossfade(valueKey, valueText);

  const labelStyle: React.CSSProperties = {
    fontSize: 9,
    fontWeight: 500,
    letterSpacing: "0.18em",
    color: "var(--keel-safe-soft)",
    textTransform: "uppercase",
  };
  const valueStyle: React.CSSProperties = {
    fontSize: 22,
    fontWeight: 500,
    letterSpacing: "-0.025em",
    lineHeight: 1,
    color: isNegative ? "var(--keel-ink-3)" : "var(--keel-ink)",
    fontVariantNumeric: "tabular-nums",
  };

  return (
    <div
      aria-live="polite"
      className="pointer-events-none inline-flex min-w-[130px] flex-col items-center rounded-[var(--radius-xs)] px-[18px] py-[10px] text-center"
      style={{
        background: "rgba(20, 26, 23, 0.85)",
        backdropFilter: "blur(30px) saturate(180%)",
        WebkitBackdropFilter: "blur(30px) saturate(180%)",
        border: "0.5px solid rgba(168, 215, 189, 0.25)",
        boxShadow:
          "inset 0 0.5px 0 rgba(255, 255, 255, 0.1), 0 8px 24px rgba(0, 0, 0, 0.5)",
      }}
    >
      <span className="relative inline-block" style={{ height: 12, minWidth: 80 }}>
        <FrameSpan
          key={`label-in-${labelFrames.cycle}`}
          text={labelFrames.incoming.value}
          kind="incoming"
          style={labelStyle}
        />
        {labelFrames.outgoing ? (
          <FrameSpan
            key={`label-out-${labelFrames.cycle}`}
            text={labelFrames.outgoing.value}
            kind="outgoing"
            style={labelStyle}
          />
        ) : null}
      </span>

      <span className="relative mt-1 inline-block tabular-nums" style={{ minWidth: 100, height: 26 }}>
        <FrameSpan
          key={`value-in-${valueFrames.cycle}`}
          text={valueFrames.incoming.value}
          kind="incoming"
          style={valueStyle}
        />
        {valueFrames.outgoing ? (
          <FrameSpan
            key={`value-out-${valueFrames.cycle}`}
            text={valueFrames.outgoing.value}
            kind="outgoing"
            style={valueStyle}
          />
        ) : null}
      </span>

      <style>{`
        @keyframes keel-amc-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes keel-amc-out {
          from { opacity: 1; }
          to { opacity: 0; }
        }
        .keel-amc-frame {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          white-space: nowrap;
        }
        .keel-amc-in {
          animation: keel-amc-in ${CROSSFADE_MS}ms cubic-bezier(0.32, 0.72, 0, 1) forwards;
        }
        .keel-amc-out {
          animation: keel-amc-out ${CROSSFADE_MS}ms cubic-bezier(0.32, 0.72, 0, 1) forwards;
        }
        .keel-amc-static {
          opacity: 1;
        }
        @media (prefers-reduced-motion: reduce) {
          .keel-amc-in,
          .keel-amc-out {
            animation-duration: 1ms;
          }
        }
      `}</style>
    </div>
  );
}

function FrameSpan({
  text,
  kind,
  style,
}: {
  text: string;
  kind: "incoming" | "outgoing";
  style: React.CSSProperties;
}) {
  // First-ever mount renders statically (no animation) so the initial paint
  // doesn't flash. Subsequent re-keys trigger fade in/out.
  return (
    <span
      className={`keel-amc-frame ${kind === "incoming" ? "keel-amc-in" : "keel-amc-out"}`}
      style={style}
    >
      {text}
    </span>
  );
}
