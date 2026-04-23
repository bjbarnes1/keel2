/**
 * Section header for grouped lists (category, frequency, archived, etc.).
 *
 * @module components/keel/category-group-header
 */

type CategoryGroupHeaderProps = {
  label: string;
  count?: number;
  /** Optional right-side text control (e.g. “Show” / “Hide”). */
  action?: { label: string; onTap: () => void };
  className?: string;
};

/** Typography: muted ink, slight tracking; optional count and action. */
export function CategoryGroupHeader({ label, count, action, className }: CategoryGroupHeaderProps) {
  return (
    <div
      className={`grid grid-cols-[1fr_auto] items-baseline gap-3 border-b border-[rgba(240,235,220,0.06)] px-2 pb-2 pt-5 ${className ?? ""}`}
    >
      <h3 className="text-[10px] font-medium uppercase tracking-[0.16em] text-[color:var(--keel-ink-5)]">
        {label}
      </h3>
      <div className="flex items-baseline gap-2 justify-self-end">
        {typeof count === "number" ? (
          <span className="text-[10px] tabular-nums text-[color:var(--keel-ink-5)]">{count}</span>
        ) : null}
        {action ? (
          <button
            type="button"
            onClick={action.onTap}
            className="text-[11px] font-medium text-[color:var(--keel-safe-soft)] transition-opacity hover:opacity-80"
          >
            {action.label}
          </button>
        ) : null}
      </div>
    </div>
  );
}
