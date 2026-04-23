"use client";

/**
 * Row with a main tap area and an isolated kebab (more actions) control.
 *
 * @module components/keel/kebab-row
 */

import { MoreHorizontal } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import { isActivationKey } from "@/components/keel/kebab-row-handlers";

export type KebabRowProps = {
  onTap: () => void;
  onKebabTap: () => void;
  children: ReactNode;
  className?: string;
};

/**
 * Flex row: body fills space (`1fr`), kebab is a 40×40 hit target. Kebab stops propagation.
 */
export function KebabRow({ onTap, onKebabTap, children, className }: KebabRowProps) {
  return (
    <div className={cn("flex min-w-0 items-stretch gap-0", className)}>
      <div
        role="button"
        tabIndex={0}
        className="min-w-0 flex-1 cursor-pointer rounded-[var(--radius-md)] outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--keel-safe-soft)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-background)]"
        onClick={onTap}
        onKeyDown={(e) => {
          if (isActivationKey(e)) {
            e.preventDefault();
            onTap();
          }
        }}
      >
        {children}
      </div>
      <div className="flex w-10 shrink-0 flex-col justify-center">
        <button
          type="button"
          aria-label="More actions"
          className="inline-flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] text-[color:var(--keel-ink-3)] outline-none transition-colors hover:bg-white/[0.04] hover:text-[color:var(--keel-ink-2)] focus-visible:ring-2 focus-visible:ring-[color:var(--keel-safe-soft)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-background)] active:bg-white/[0.06]"
          onClick={(e) => {
            e.stopPropagation();
            onKebabTap();
          }}
          onKeyDown={(e) => {
            if (isActivationKey(e)) {
              e.preventDefault();
              e.stopPropagation();
              onKebabTap();
            }
          }}
        >
          <MoreHorizontal className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
