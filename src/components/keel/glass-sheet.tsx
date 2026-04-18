"use client";

/**
 * GlassSheet — full-viewport bottom sheet with Keel glass chrome.
 *
 * Props:
 * - open: controlled visibility
 * - onClose: called on backdrop tap, Escape, grabber
 * - title?: optional heading
 * - children: scrollable body
 * - footer?: pinned below body
 * - dismissOnBackdrop?: default true
 * - dismissOnEscape?: default true
 * - className?: extra classes on the sheet panel
 */
import { useCallback, useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";

type GlassSheetProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  dismissOnBackdrop?: boolean;
  dismissOnEscape?: boolean;
  className?: string;
};

export function GlassSheet({
  open,
  onClose,
  title,
  children,
  footer,
  dismissOnBackdrop = true,
  dismissOnEscape = true,
  className,
}: GlassSheetProps) {
  const titleId = useId();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    queueMicrotask(() => setMounted(true));
  }, []);

  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!open || !dismissOnEscape) return;
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    },
    [dismissOnEscape, onClose, open],
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener("keydown", onKeyDown);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prev;
    };
  }, [onKeyDown, open]);

  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex flex-col justify-end" role="presentation">
      <button
        type="button"
        aria-label="Close sheet"
        className="keel-glass-sheet-backdrop absolute inset-0 bg-black/45 backdrop-blur-sm"
        onClick={() => dismissOnBackdrop && onClose()}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        className={`keel-glass-sheet-panel relative mx-auto w-full max-w-lg glass-heavy glass-tint-safe rounded-t-[var(--radius-lg)] border border-white/10 shadow-[0_-12px_40px_rgba(0,0,0,0.35)] ${className ?? ""}`}
      >
        <div className="flex max-h-[min(88vh,860px)] flex-col">
          <div className="flex shrink-0 flex-col items-center gap-2 px-4 pb-2 pt-3">
            <button
              type="button"
              aria-label="Dismiss"
              className="h-1.5 w-10 rounded-full bg-white/25 transition-colors hover:bg-white/35"
              onClick={onClose}
            />
            {title ? (
              <h2 id={titleId} className="w-full text-center text-[17px] font-semibold text-[var(--keel-ink)]">
                {title}
              </h2>
            ) : null}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-2">{children}</div>
          {footer ? <div className="shrink-0 border-t border-white/10 px-4 py-3">{footer}</div> : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
