"use client";

/**
 * FAB-style add button on browse surfaces: optional link or tap handler, hides on
 * scroll-down and when any {@link GlassSheet} in scope is open.
 *
 * @module components/keel/floating-add-button
 */

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

import { useAnyGlassSheetOpen } from "@/components/keel/glass-sheet-scope";

export type FloatingAddButtonProps = {
  /** Navigate on tap (mutually exclusive with `onTap`). */
  href?: string;
  /** Client handler when not using `href`. */
  onTap?: () => void;
  label?: string;
  icon?: ReactNode;
  className?: string;
};

const SCROLL_HIDE_AFTER = 80;

/**
 * FAB fixed above the tab bar. Uses glass-heavy + safe tint; hides on downward scroll.
 */
export function FloatingAddButton({
  href,
  onTap,
  label,
  icon,
  className,
}: FloatingAddButtonProps) {
  const sheetOpen = useAnyGlassSheetOpen();
  const [hidden, setHidden] = useState(false);
  const lastY = useRef(0);
  const accDown = useRef(0);

  const onScroll = useCallback(() => {
    const y = window.scrollY ?? document.documentElement.scrollTop;
    const delta = y - lastY.current;
    lastY.current = y;
    if (y < 24) {
      setHidden(false);
      accDown.current = 0;
      return;
    }
    if (delta > 4) {
      accDown.current += delta;
      if (accDown.current > SCROLL_HIDE_AFTER) setHidden(true);
    } else if (delta < -4) {
      accDown.current = 0;
      setHidden(false);
    }
  }, []);

  useEffect(() => {
    lastY.current = window.scrollY ?? 0;
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [onScroll]);

  const vibrate = () => {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(12);
    }
  };

  const pill = Boolean(label);
  /** Hide while scrolling down or while a sheet is open (don’t sync `hidden` to sheet — avoids effect setState). */
  const show = !hidden && !sheetOpen;

  const inner = (
    <>
      {icon ?? <span aria-hidden>+</span>}
      {label ? (
        <span className="max-w-[140px] truncate pl-1 text-[13px] font-medium text-[color:var(--keel-safe-soft)]">
          {label}
        </span>
      ) : null}
    </>
  );

  const sharedClass = cn(
    "fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-4 z-40 flex items-center justify-center",
    "glass-heavy glass-tint-safe border-[0.5px] border-[rgba(142,196,168,0.25)]",
    "text-[20px] font-light text-[color:var(--keel-safe-soft)]",
    "shadow-[0_8px_24px_rgba(0,0,0,0.4),inset_0_0.5px_0_rgba(255,255,255,0.08)] backdrop-blur-[30px] backdrop-saturate-[180%]",
    "transition-[opacity,transform] duration-200 ease-out active:scale-95",
    pill ? "h-14 min-w-14 rounded-full px-4" : "h-14 w-14 rounded-full",
    show ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0",
    className,
  );

  const aria = label ?? "Add";

  if (href) {
    return (
      <Link
        href={href}
        onPointerDown={vibrate}
        className={sharedClass}
        aria-label={aria}
      >
        {inner}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onTap?.()}
      onPointerDown={vibrate}
      className={sharedClass}
      aria-label={aria}
    >
      {inner}
    </button>
  );
}
