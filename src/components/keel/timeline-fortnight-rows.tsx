"use client";

import { useState } from "react";

import type { ProjectionEventView } from "@/lib/types";

import { CommitmentRestoreSheet } from "./commitment-restore-sheet";
import { ProjectionRow } from "./projection-row";

export function TimelineFortnightRows({
  sections,
}: {
  sections: Array<{ idx: number; opacity: number; label: string; rows: ProjectionEventView[] }>;
}) {
  const [restore, setRestore] = useState<{ skipId: string; label: string } | null>(null);

  return (
    <>
      <div className="mt-6 space-y-6">
        {sections.map((section) => (
          <section key={section.idx} style={{ opacity: section.opacity }}>
            <p className="label-upper">{section.label}</p>
            <div className="mt-2 space-y-2">
              {section.rows.length === 0 ? (
                <div className="glass-clear rounded-[var(--radius-md)] px-3 py-4 text-sm text-[color:var(--keel-ink-3)]">
                  No scheduled cash events in this fortnight.
                </div>
              ) : (
                section.rows.map((event) => (
                  <ProjectionRow
                    key={event.id}
                    event={event}
                    onSkippedBillActivate={
                      event.type === "bill" && event.isSkipped && event.skipId
                        ? () => setRestore({ skipId: event.skipId!, label: event.label })
                        : undefined
                    }
                  />
                ))
              )}
            </div>
          </section>
        ))}
      </div>

      <CommitmentRestoreSheet
        open={restore != null}
        onClose={() => setRestore(null)}
        skipId={restore?.skipId ?? null}
        label={restore?.label}
      />
    </>
  );
}
