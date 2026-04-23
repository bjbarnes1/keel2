"use client";

/**
 * GlassSheet — full-viewport bottom sheet with Keel glass chrome.
 *
 * @module components/keel/glass-sheet
 *
 * Features: optional `size` (max height), sticky `footer`, grab-handle drag dismiss
 * (threshold 80px), focus trap while open, `prefers-reduced-motion` friendly transitions,
 * body scroll lock. Registers with {@link GlassSheetScopeProvider} when open for FAB hide.
 */
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";

import { GLASS_SHEET_MAX_HEIGHT, type GlassSheetSize } from "@/components/keel/glass-sheet-layout";
import { useRegisterGlassSheetOpen } from "@/components/keel/glass-sheet-scope";

export type GlassSheetProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  footer?: ReactNode;
  /** Max height of the sheet stack (header + scroll + footer). @default 'tall' */
  size?: GlassSheetSize;
  dismissOnBackdrop?: boolean;
  dismissOnEscape?: boolean;
  /** When false, drag-down on the grab handle does not close the sheet. */
  allowGrabDismiss?: boolean;
  className?: string;
};

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function subscribeReducedMotion(callback: () => void) {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", callback);
  return () => mq.removeEventListener("change", callback);
}

function getReducedMotionSnapshot() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function usePrefersReducedMotion() {
  return useSyncExternalStore(subscribeReducedMotion, getReducedMotionSnapshot, () => false);
}

export function GlassSheet({
  open,
  onClose,
  title,
  children,
  footer,
  size = "tall",
  dismissOnBackdrop = true,
  dismissOnEscape = true,
  allowGrabDismiss = true,
  className,
}: GlassSheetProps) {
  const titleId = useId();
  const [mounted, setMounted] = useState(false);
  const [entered, setEntered] = useState(false);
  const [exiting, setExiting] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const prevFocusRef = useRef<HTMLElement | null>(null);
  const dragStartY = useRef<number | null>(null);
  const wasOpenRef = useRef(false);
  const reducedMotion = usePrefersReducedMotion();

  const visible = open || exiting;

  useEffect(() => {
    queueMicrotask(() => setMounted(true));
  }, []);

  /* eslint-disable react-hooks/set-state-in-effect -- enter/exit animation tied to `open` */
  useEffect(() => {
    let enterFrame = 0;
    let exitTimer = 0;

    if (open) {
      wasOpenRef.current = true;
      setExiting(false);
      enterFrame = requestAnimationFrame(() => {
        requestAnimationFrame(() => setEntered(true));
      });
    } else if (wasOpenRef.current) {
      wasOpenRef.current = false;
      setEntered(false);
      if (!reducedMotion) {
        setExiting(true);
        exitTimer = window.setTimeout(() => setExiting(false), 220);
      } else {
        setExiting(false);
      }
    } else {
      setEntered(false);
      setExiting(false);
    }

    return () => {
      if (enterFrame) cancelAnimationFrame(enterFrame);
      if (exitTimer) window.clearTimeout(exitTimer);
    };
  }, [open, reducedMotion]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useRegisterGlassSheetOpen(Boolean(visible && mounted));

  const onKeyDownDoc = useCallback(
    (e: KeyboardEvent) => {
      if (!visible || !dismissOnEscape) return;
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    },
    [dismissOnEscape, onClose, visible],
  );

  useEffect(() => {
    if (!visible) return;
    document.addEventListener("keydown", onKeyDownDoc);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDownDoc);
      document.body.style.overflow = prev;
    };
  }, [onKeyDownDoc, visible]);

  useEffect(() => {
    if (!open || !panelRef.current) return;
    prevFocusRef.current = document.activeElement as HTMLElement | null;
    const root = panelRef.current;
    const focusables = () =>
      Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => !el.hasAttribute("disabled") && el.offsetParent !== null,
      );
    const nodes = focusables();
    nodes[0]?.focus();

    function onKeyDownTrap(e: KeyboardEvent) {
      if (e.key !== "Tab" || !root) return;
      const list = focusables();
      if (list.length === 0) return;
      const ix = list.indexOf(document.activeElement as HTMLElement);
      if (e.shiftKey) {
        if (ix <= 0) {
          e.preventDefault();
          list[list.length - 1]?.focus();
        }
      } else if (ix === list.length - 1 || ix === -1) {
        e.preventDefault();
        list[0]?.focus();
      }
    }
    root.addEventListener("keydown", onKeyDownTrap);
    return () => {
      root.removeEventListener("keydown", onKeyDownTrap);
      prevFocusRef.current?.focus?.();
      prevFocusRef.current = null;
    };
  }, [open]);

  if (!mounted || !visible) return null;

  const maxH = GLASS_SHEET_MAX_HEIGHT[size];
  const instant = reducedMotion;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex flex-col justify-end" role="presentation">
      <button
        type="button"
        aria-label="Close sheet"
        className={cn(
          "keel-glass-sheet-backdrop absolute inset-0",
          "bg-[rgba(14,20,18,0.6)] backdrop-blur-[12px] backdrop-saturate-[140%]",
          instant ? "opacity-100" : "opacity-0 transition-opacity duration-200",
          entered && open ? "opacity-100" : !instant && !open ? "opacity-0" : null,
        )}
        onClick={() => dismissOnBackdrop && onClose()}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        className={cn(
          "keel-glass-sheet-panel relative mx-auto w-full max-w-[520px]",
          "glass-heavy glass-tint-safe rounded-t-[24px] border border-white/10",
          "shadow-[0_-12px_48px_rgba(0,0,0,0.4),inset_0_0.5px_0_rgba(255,255,255,0.08)]",
          instant
            ? "translate-y-0 opacity-100"
            : cn(
                "transition-[transform,opacity] duration-[280ms] ease-[cubic-bezier(0.32,0.72,0,1)]",
                entered && open ? "translate-y-0 opacity-100" : "translate-y-full opacity-90",
              ),
          className,
        )}
        style={{
          backgroundColor: "rgba(20, 26, 23, 0.92)",
          backdropFilter: "blur(40px) saturate(180%)",
          WebkitBackdropFilter: "blur(40px) saturate(180%)",
        }}
      >
        <div className="flex flex-col" style={{ maxHeight: maxH }}>
          <div className="flex shrink-0 flex-col items-center gap-2 px-5 pb-2 pt-3">
            <button
              type="button"
              aria-label="Dismiss"
              className="h-[3px] w-8 shrink-0 rounded-full bg-[rgba(240,235,220,0.25)] transition-colors hover:bg-[rgba(240,235,220,0.35)] touch-none"
              onClick={onClose}
              onPointerDown={(e) => {
                if (!allowGrabDismiss) return;
                dragStartY.current = e.clientY;
                e.currentTarget.setPointerCapture(e.pointerId);
              }}
              onPointerMove={(e) => {
                if (!allowGrabDismiss || dragStartY.current == null) return;
                const dy = e.clientY - dragStartY.current;
                if (dy > 80) {
                  dragStartY.current = null;
                  try {
                    e.currentTarget.releasePointerCapture(e.pointerId);
                  } catch {
                    /* ignore */
                  }
                  onClose();
                }
              }}
              onPointerUp={(e) => {
                dragStartY.current = null;
                try {
                  e.currentTarget.releasePointerCapture(e.pointerId);
                } catch {
                  /* ignore */
                }
              }}
              onPointerCancel={(e) => {
                dragStartY.current = null;
                try {
                  e.currentTarget.releasePointerCapture(e.pointerId);
                } catch {
                  /* ignore */
                }
              }}
            />
            {title ? (
              <h2
                id={titleId}
                className="w-full px-0 pb-1 pt-0 text-center text-[17px] font-medium text-[color:var(--keel-ink)]"
              >
                {title}
              </h2>
            ) : null}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4">{children}</div>
          {footer ? (
            <div className="shrink-0 border-t border-[rgba(240,235,220,0.08)] px-5 py-3 pt-3">
              {footer}
            </div>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
