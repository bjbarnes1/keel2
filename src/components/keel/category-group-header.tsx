/**
 * Section header for category-grouped commitment lists.
 *
 * @module components/keel/category-group-header
 */

type CategoryGroupHeaderProps = {
  label: string;
  count?: number;
  className?: string;
};

/** Typography: muted ink, slight tracking. */
export function CategoryGroupHeader({ label, count, className }: CategoryGroupHeaderProps) {
  return (
    <div
      className={`flex items-baseline justify-between gap-3 px-1 py-2 ${className ?? ""}`}
    >
      <h3 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-[var(--keel-ink-5)]">
        {label}
      </h3>
      {typeof count === "number" ? (
        <span className="text-[12px] tabular-nums text-[var(--keel-ink-5)]">{count}</span>
      ) : null}
    </div>
  );
}
