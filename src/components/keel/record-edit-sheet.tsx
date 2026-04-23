"use client";

/**
 * Shared record edit UI: {@link RecordEditDisclosure} for progressive sections and
 * {@link RecordEditSheet} — schema-driven sheet (income + commitment) with applies-from,
 * validation, and dirty-dismiss confirmation.
 *
 * @module components/keel/record-edit-sheet
 */

import type { ReactNode } from "react";
import { useCallback, useEffect, useId, useMemo, useState, useTransition } from "react";
import type { ZodSchema } from "zod";

import { cn, toIsoDate } from "@/lib/utils";

import type {
  RecordEditFieldDef,
  RecordEditSectionDef,
} from "@/lib/schemas/record-edit-schemas";

import { CategoryGroupHeader } from "@/components/keel/category-group-header";
import { GlassSheet } from "@/components/keel/glass-sheet";

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

export type RecordEditSheetProps<T extends Record<string, unknown>> = {
  open: boolean;
  onClose: () => void;
  recordType: "income" | "commitment";
  record: T | null;
  schema: ZodSchema<T>;
  sections: Array<RecordEditSectionDef<T>>;
  onSubmit: (data: T, appliesFrom: Date) => Promise<void>;
  title?: string;
  /** Extra select options keyed by field id (e.g. categoryId, fundedByIncomeId). */
  fieldOptions?: Partial<Record<string, Array<{ value: string; label: string }>>>;
  /** Fires after any field change (for dependent option lists). */
  onValuesChange?: (values: T) => void;
  /** Extra content under the field sections (e.g. per-pay preview); receives current form values. */
  afterFields?: (values: T) => ReactNode;
};

function shallowRecordEqual(a: Record<string, unknown>, b: Record<string, unknown>) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    if (a[k] !== b[k]) return false;
  }
  return true;
}

function defaultTitle(recordType: "income" | "commitment", record: unknown) {
  const mode = record ? "Edit" : "Add";
  return `${mode} ${recordType}`;
}

/**
 * Schema-driven edit sheet: applies-from date, sections, Zod validation, dirty dismiss guard.
 */
export function RecordEditSheet<T extends Record<string, unknown>>({
  open,
  onClose,
  recordType,
  record,
  schema,
  sections,
  onSubmit,
  title,
  fieldOptions = {},
  onValuesChange,
  afterFields,
}: RecordEditSheetProps<T>) {
  const formId = useId();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<string, string>>>({});
  const [showDiscard, setShowDiscard] = useState(false);
  const todayIso = useMemo(() => toIsoDate(new Date()), []);

  const initialValues = useMemo(() => {
    const base = (record ?? {}) as Record<string, unknown>;
    const out = { ...base } as Record<string, unknown>;
    for (const sec of sections) {
      for (const f of sec.fields) {
        if (out[f.id] === undefined && f.type === "toggle") {
          out[f.id] = false;
        }
      }
    }
    return out as T;
  }, [record, sections]);

  const [values, setValues] = useState<T>(initialValues);
  const [appliesFrom, setAppliesFrom] = useState(todayIso);

  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => {
      setValues(initialValues);
      setAppliesFrom(todayIso);
      setFieldErrors({});
      setError(null);
      setShowDiscard(false);
      onValuesChange?.(initialValues);
    });
  }, [open, initialValues, todayIso, onValuesChange]);

  useEffect(() => {
    if (!showDiscard) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        setShowDiscard(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showDiscard]);

  const dirty = useMemo(
    () => !shallowRecordEqual(values as Record<string, unknown>, initialValues as Record<string, unknown>),
    [values, initialValues],
  );
  const dirtyWithDate = dirty || appliesFrom !== todayIso;

  const requestClose = useCallback(() => {
    if (dirtyWithDate) setShowDiscard(true);
    else onClose();
  }, [dirtyWithDate, onClose]);

  function renderField(field: RecordEditFieldDef<T>) {
    const v = values[field.id];
    const err = fieldErrors[field.id];
    const opts = field.options?.length ? field.options : fieldOptions[field.id] ?? [];

    const common =
      "w-full rounded-[var(--radius-md)] border border-[rgba(240,235,220,0.08)] bg-black/25 px-3 py-3 text-sm text-[color:var(--keel-ink)] outline-none focus:ring-2 focus:ring-[color:var(--keel-safe-soft)] focus:ring-offset-2 focus:ring-offset-[var(--color-background)]";

    const onChange = (next: unknown) => {
      setValues((prev) => {
        let merged = { ...prev, [field.id]: next } as T;
        if (recordType === "commitment" && field.id === "categoryId") {
          merged = { ...merged, subcategoryId: "" } as T;
        }
        queueMicrotask(() => onValuesChange?.(merged));
        return merged;
      });
      setFieldErrors((prev) => ({ ...prev, [field.id]: undefined }));
    };

    let control: ReactNode = null;
    if (field.type === "text") {
      control = (
        <input
          type="text"
          value={String(v ?? "")}
          onChange={(e) => onChange(e.target.value)}
          className={common}
        />
      );
    } else if (field.type === "number" || field.type === "currency") {
      control = (
        <input
          type="text"
          inputMode="decimal"
          value={v === undefined || v === null ? "" : String(v)}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === "") {
              onChange(undefined);
              return;
            }
            const n = Number.parseFloat(raw);
            onChange(Number.isFinite(n) ? n : raw);
          }}
          className={cn(common, "font-mono tabular-nums")}
        />
      );
    } else if (field.type === "date") {
      control = (
        <input
          type="date"
          value={String(v ?? "").slice(0, 10)}
          onChange={(e) => onChange(e.target.value)}
          className={common}
        />
      );
    } else if (field.type === "select") {
      control =
        opts.length === 0 ? (
          <select disabled className={cn(common, "opacity-60")}>
            <option value="">—</option>
          </select>
        ) : (
          <select
            value={String(v ?? "")}
            onChange={(e) => onChange(e.target.value)}
            className={common}
          >
            {opts.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        );
    } else if (field.type === "toggle") {
      control = (
        <button
          type="button"
          role="switch"
          aria-checked={Boolean(v)}
          onClick={() => onChange(!Boolean(v))}
          className={cn(
            "relative h-8 w-14 rounded-full border border-white/12 transition-colors",
            v ? "bg-[color:var(--keel-safe)]/35" : "bg-black/30",
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 h-7 w-7 rounded-full bg-[color:var(--keel-ink)] transition-transform",
              v ? "left-6" : "left-0.5",
            )}
          />
        </button>
      );
    }

    return (
      <label key={field.id} className="block space-y-2">
        <span className="text-sm text-[color:var(--keel-ink-3)]">{field.label}</span>
        {control}
        {field.hint ? <span className="text-[11px] text-[color:var(--keel-ink-4)]">{field.hint}</span> : null}
        {err ? <span className="text-[11px] text-[color:var(--keel-attend)]">{err}</span> : null}
      </label>
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const parsed = schema.safeParse(values);
    if (!parsed.success) {
      const next: Partial<Record<string, string>> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "");
        if (key && !next[key]) next[key] = issue.message;
      }
      setFieldErrors(next);
      return;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(appliesFrom)) {
      setError("Applies-from must be a valid date.");
      return;
    }

    startTransition(async () => {
      try {
        await onSubmit(parsed.data, new Date(`${appliesFrom}T00:00:00Z`));
        onClose();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not save.");
      }
    });
  }

  const heading = title ?? defaultTitle(recordType, record);

  return (
    <GlassSheet
      open={open}
      onClose={requestClose}
      title={heading}
      size="tall"
      allowGrabDismiss={!dirtyWithDate}
      footer={
        <div className="flex gap-2">
          <button
            type="button"
            onClick={requestClose}
            className="flex-1 rounded-[var(--radius-md)] border border-white/15 py-3 text-sm font-medium text-[color:var(--keel-ink-2)]"
          >
            Cancel
          </button>
          <button
            type="submit"
            form={formId}
            disabled={pending}
            className={cn(
              "flex-1 rounded-[var(--radius-md)] border border-white/12 py-3 text-sm font-semibold text-[color:var(--keel-ink)] transition-opacity disabled:opacity-40",
              "glass-tint-safe",
            )}
          >
            {pending ? "Saving…" : "Save"}
          </button>
        </div>
      }
    >
      <div className="relative min-h-[200px]">
      <form id={formId} className="space-y-4 pb-2" onSubmit={handleSubmit}>
        <label className="block space-y-2">
          <span className="text-sm font-medium text-[color:var(--keel-ink-3)]">Applies from (UTC date)</span>
          <input
            type="date"
            required
            min={todayIso}
            value={appliesFrom}
            onChange={(e) => setAppliesFrom(e.target.value)}
            className="w-full rounded-[var(--radius-md)] border border-[rgba(240,235,220,0.08)] bg-black/25 px-3 py-3 text-sm text-[color:var(--keel-ink)] outline-none focus:ring-2 focus:ring-[color:var(--keel-safe-soft)]"
          />
        </label>

        <RecordEditDisclosure summary="How versioning works" defaultOpen={false}>
          <p className="text-sm leading-6 text-[color:var(--keel-ink-3)]">
            Changes create a new version from the date you pick. Keel keeps using your current details
            until then, and doesn&apos;t rewrite how past dates were calculated.
          </p>
        </RecordEditDisclosure>

        {sections.map((section) => {
          const body = <div className="space-y-4">{section.fields.map((f) => renderField(f))}</div>;
          if (section.disclosure === "progressive") {
            return (
              <RecordEditDisclosure key={section.id} summary={section.label}>
                {body}
              </RecordEditDisclosure>
            );
          }
          return (
            <div key={section.id} className="space-y-2">
              <CategoryGroupHeader label={section.label} />
              {body}
            </div>
          );
        })}

        {afterFields?.(values)}

        {error ? <p className="text-sm text-[color:var(--keel-attend)]">{error}</p> : null}
      </form>

      {showDiscard ? (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center rounded-[var(--radius-md)] bg-black/40 px-4 py-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby={`${formId}-discard-title`}
        >
          <div className="glass-heavy w-full max-w-sm rounded-[var(--radius-md)] border border-white/12 p-5 shadow-xl">
            <h3 id={`${formId}-discard-title`} className="text-center text-base font-medium text-[color:var(--keel-ink)]">
              Discard changes?
            </h3>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                autoFocus
                className="flex-1 rounded-[var(--radius-md)] border border-white/15 py-3 text-sm font-medium text-[color:var(--keel-ink-2)]"
                onClick={() => setShowDiscard(false)}
              >
                Keep editing
              </button>
              <button
                type="button"
                className={cn(
                  "flex-1 rounded-[var(--radius-md)] border border-white/12 py-3 text-sm font-semibold text-[color:var(--keel-ink)]",
                  "glass-tint-attend",
                )}
                onClick={() => {
                  setShowDiscard(false);
                  onClose();
                }}
              >
                Discard
              </button>
            </div>
          </div>
        </div>
      ) : null}
      </div>
    </GlassSheet>
  );
}
