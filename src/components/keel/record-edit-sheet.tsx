"use client";

/**
 * Shared disclosure + layout helpers for record edit sheets (commitment, income, future types).
 *
 * @module components/keel/record-edit-sheet
 */

import type { ReactNode } from "react";

type DisclosureProps = {
  summary: string;
  children: ReactNode;
  defaultOpen?: boolean;
};

/**
 * Collapsible "advanced" block — keeps primary fields visible first (name, amount, dates).
 */
export function RecordEditDisclosure({ summary, children, defaultOpen = false }: DisclosureProps) {
  return (
    <details
      className="mt-2 rounded-[var(--radius-md)] border border-white/10 open:bg-black/15"
      {...(defaultOpen ? { defaultOpen: true } : {})}
    >
      <summary className="cursor-pointer select-none list-none px-3 py-2.5 text-sm font-medium text-[color:var(--keel-ink-2)] [&::-webkit-details-marker]:hidden">
        {summary}
      </summary>
      <div className="space-y-4 border-t border-white/8 px-3 pb-3 pt-3">{children}</div>
    </details>
  );
}
