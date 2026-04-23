"use client";

/**
 * Custom glass-aesthetic select that replaces native OS pickers (which render with
 * platform-default styling that breaks the dark glass theme on iOS/Android).
 *
 * Renders as a pill button that opens a floating list popover. The selected option
 * gets a left accent stripe and a sea-green checkmark. A configurable footer slot
 * supports "+ New category" style actions separated by a divider.
 *
 * @module components/keel/keel-select
 */

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

export type KeelSelectOption = {
  value: string;
  label: string;
};

type Props = {
  value: string;
  options: KeelSelectOption[];
  onChange: (value: string) => void;
  /** Rendered below a divider at the bottom of the list. */
  footer?: React.ReactNode;
  placeholder?: string;
  className?: string;
};

export function KeelSelect({ value, options, onChange, footer, placeholder = "Select…", className }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-[var(--radius-md)] bg-black/25 px-3 py-2 text-sm text-[color:var(--keel-ink)] ring-1 ring-white/10"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={selected ? undefined : "text-[color:var(--keel-ink-4)]"}>
          {selected?.label ?? placeholder}
        </span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          aria-hidden="true"
          className={cn("shrink-0 transition-transform text-[color:var(--keel-ink-3)]", open && "rotate-180")}
        >
          <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-[var(--radius-lg)] glass-heavy shadow-xl"
          style={{ backdropFilter: "blur(24px)" }}
        >
          <ul className="max-h-56 overflow-y-auto py-1">
            {options.map((opt) => {
              const isSelected = opt.value === value;
              return (
                <li key={opt.value}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => {
                      onChange(opt.value);
                      setOpen(false);
                    }}
                    className={cn(
                      "relative flex w-full items-center gap-3 px-4 py-2.5 text-sm text-left min-h-[44px]",
                      isSelected
                        ? "text-[color:var(--keel-ink)] bg-white/5"
                        : "text-[color:var(--keel-ink-2)] hover:bg-white/5",
                    )}
                  >
                    {isSelected && (
                      <span className="absolute inset-y-0 left-0 w-0.5 rounded-r-full bg-[color:var(--keel-safe-soft)]" />
                    )}
                    <span className="flex-1">{opt.label}</span>
                    {isSelected && (
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                        <path
                          d="M2.5 7l3.5 3.5 5.5-7"
                          stroke="var(--keel-safe-soft)"
                          strokeWidth="1.7"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>

          {footer && (
            <>
              <div className="border-t border-white/10" />
              <div className="py-1">{footer}</div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
