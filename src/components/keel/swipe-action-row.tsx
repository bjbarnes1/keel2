"use client";

/**
 * Mobile-style swipe-to-reveal row actions (commitments list).
 *
 * @module components/keel/swipe-action-row
 */

import { useCallback, useRef, useState } from "react";

const ACTION_WIDTH = 80;

export type SwipeTint = "safe" | "attend" | "neutral";

export type SwipeAction = {
  label: string;
  onPress: () => void;
  tint: SwipeTint;
};

type SwipeActionRowProps = {
  children: React.ReactNode;
  primaryAction?: SwipeAction;
  secondaryAction?: SwipeAction;
  className?: string;
};

function tintClasses(tint: SwipeTint) {
  switch (tint) {
    case "safe":
      return "glass-tint-safe text-[var(--keel-ink)]";
    case "attend":
      return "glass-tint-attend text-[var(--keel-ink)]";
    default:
      return "bg-white/10 text-[var(--keel-ink)]";
  }
}

/**
 * Mail-style partial swipe row. Pointer + CSS transform (no Framer).
 * primaryAction is rightmost (revealed first when swiping left).
 */
export function SwipeActionRow({
  children,
  primaryAction,
  secondaryAction,
  className,
}: SwipeActionRowProps) {
  const startX = useRef(0);
  const startOffset = useRef(0);
  const offsetRef = useRef(0);
  const [offset, setOffset] = useState(0);
  const dragging = useRef(false);

  const actionCount = (primaryAction ? 1 : 0) + (secondaryAction ? 1 : 0);
  const maxReveal = actionCount * ACTION_WIDTH;

  const snapTo = useCallback(
    (value: number) => {
      const clamped = Math.max(-maxReveal, Math.min(0, value));
      offsetRef.current = clamped;
      setOffset(clamped);
    },
    [maxReveal],
  );

  const onPointerDown = (e: React.PointerEvent) => {
    if (maxReveal <= 0) return;
    dragging.current = true;
    startX.current = e.clientX;
    startOffset.current = offsetRef.current;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current || maxReveal <= 0) return;
    const dx = e.clientX - startX.current;
    const next = startOffset.current + dx;
    snapTo(next);
  };

  const endDrag = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    dragging.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }

    const current = offsetRef.current;
    if (primaryAction && current <= -maxReveal * 0.92) {
      primaryAction.onPress();
      snapTo(0);
      return;
    }

    const threshold = maxReveal * 0.35;
    if (current < -threshold) {
      snapTo(-maxReveal);
    } else {
      snapTo(0);
    }
  };

  if (maxReveal <= 0) {
    return <div className={className}>{children}</div>;
  }

  return (
    <div className={`relative overflow-hidden rounded-[var(--radius-md)] ${className ?? ""}`}>
      <div className="absolute inset-y-0 right-0 flex" style={{ width: maxReveal }} aria-hidden>
        {secondaryAction ? (
          <button
            type="button"
            className={`flex h-full flex-1 items-center justify-center px-1 text-center text-[12px] font-semibold leading-tight ${tintClasses(secondaryAction.tint)}`}
            style={{ width: ACTION_WIDTH, minWidth: ACTION_WIDTH }}
            onClick={() => {
              secondaryAction.onPress();
              snapTo(0);
            }}
          >
            {secondaryAction.label}
          </button>
        ) : null}
        {primaryAction ? (
          <button
            type="button"
            className={`flex h-full flex-1 items-center justify-center px-1 text-center text-[12px] font-semibold leading-tight ${tintClasses(primaryAction.tint)}`}
            style={{ width: ACTION_WIDTH, minWidth: ACTION_WIDTH }}
            onClick={() => {
              primaryAction.onPress();
              snapTo(0);
            }}
          >
            {primaryAction.label}
          </button>
        ) : null}
      </div>
      <div
        className="relative z-[1] touch-pan-y bg-transparent transition-[transform] duration-200 ease-out will-change-transform"
        style={{ transform: `translateX(${offset}px)` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {children}
      </div>
    </div>
  );
}
