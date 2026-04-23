"use client";

/**
 * Capture panel: the user describes something in plain language; Keel parses it and
 * presents a receipt-style confirmation card. Seven fields collapse into typography.
 * One primary action. The user confirms rather than completing.
 *
 * @module components/keel/capture-keel-panel
 */

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  createAssetFromCapture,
  createCommitmentFromCapture,
  createIncomeFromCapture,
} from "@/app/actions/capture";
import { KeelSelect } from "@/components/keel/keel-select";
import { decodeCapturePrefillParam } from "@/lib/ai/capture-prefill";
import type { AssetCapturePayload, CommitmentCapturePayload, IncomeCapturePayload } from "@/lib/ai/capture-schemas";
import { cn, formatAudFixed, formatDisplayDate } from "@/lib/utils";

type CaptureApiResponse =
  | { kind: "unknown" }
  | { kind: "commitment"; payload: CommitmentCapturePayload }
  | { kind: "income"; payload: IncomeCapturePayload }
  | { kind: "asset"; payload: AssetCapturePayload };

type CategoryOption = { id: string; name: string; subcategories: Array<{ id: string; name: string }> };

// --- Format helpers -----------------------------------------------------------

function frequencyPhrase(f: string): string {
  const map: Record<string, string> = {
    weekly: "every week",
    fortnightly: "every fortnight",
    monthly: "every month",
    quarterly: "every quarter",
    annual: "annually",
  };
  return map[f] ?? f;
}

function buildDetailLine(amount: number, frequency: string, nextDate: string | null): string {
  const parts = [`${formatAudFixed(amount)} ${frequencyPhrase(frequency)}`];
  if (nextDate) parts.push(`starts ${formatDisplayDate(nextDate, "short-day")}`);
  return parts.join(" · ");
}

// --- Main component -----------------------------------------------------------

export function CaptureKeelPanel({ categories = [] }: { categories?: CategoryOption[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefillDigestApplied = useRef<string | null>(null);
  const forcedKindParam = searchParams.get("kind");
  const forcedKind =
    forcedKindParam === "commitment" || forcedKindParam === "income" || forcedKindParam === "asset"
      ? forcedKindParam
      : undefined;

  const [sentence, setSentence] = useState("");
  const [submittedSentence, setSubmittedSentence] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<CaptureApiResponse | null>(null);

  const canSubmit = useMemo(() => sentence.trim().length > 0 && !pending, [sentence, pending]);

  useEffect(() => {
    const raw = searchParams.get("prefill");
    if (!raw) return;
    const decoded = decodeCapturePrefillParam(raw);
    if (!decoded) return;
    const digest = `${decoded.sentence}::${decoded.capture.kind}::${decoded.capture.payload.name}`;
    if (prefillDigestApplied.current === digest) return;
    prefillDigestApplied.current = digest;
    setError(null);
    setSentence(decoded.sentence);
    setSubmittedSentence(decoded.sentence);
    setPreview(decoded.capture);
    router.replace("/capture", { scroll: false });
  }, [router, searchParams]);

  async function runCapture(nextSentence: string) {
    const trimmed = nextSentence.trim();
    if (!trimmed) return;

    setPending(true);
    setError(null);
    setPreview(null);

    try {
      const res = await fetch("/api/capture", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sentence: trimmed, ...(forcedKind ? { forcedKind } : {}) }),
      });

      const json = (await res.json()) as CaptureApiResponse & { error?: string };

      if (!res.ok) {
        setError(res.status === 503 ? "Capture is offline right now." : (json.error ?? "Unable to capture."));
        return;
      }
      if ("error" in json && json.error) {
        setError(json.error);
        return;
      }

      setSubmittedSentence(trimmed);
      setPreview(json as CaptureApiResponse);
    } catch {
      setError("Unable to capture.");
    } finally {
      setPending(false);
    }
  }

  const showReceipt = preview && preview.kind !== "unknown";

  return (
    <div className="pb-28">
      {showReceipt ? (
        <ReceiptCard
          preview={preview as Extract<CaptureApiResponse, { kind: "commitment" | "income" | "asset" }>}
          sentence={submittedSentence}
          categories={categories}
          onReset={() => {
            setSentence(submittedSentence);
            setPreview(null);
          }}
          onCommitted={() => {
            setSentence("");
            setPreview(null);
            setSubmittedSentence("");
          }}
        />
      ) : (
        <>
          <label className="block">
            <span className="sr-only">Tell Keel what you want to add</span>
            <textarea
              value={sentence}
              onChange={(e) => setSentence(e.target.value)}
              placeholder="Tell Keel, in your own words"
              rows={3}
              className="glass-clear w-full resize-none rounded-[var(--radius-lg)] px-3 py-3 text-sm text-[color:var(--keel-ink)] outline-none placeholder:text-[color:var(--keel-ink-4)]"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (canSubmit) void runCapture(sentence);
                }
              }}
            />
          </label>

          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => void runCapture(sentence)}
            className={cn(
              "mt-3 w-full rounded-[var(--radius-pill)] px-4 py-3 text-sm font-semibold transition-opacity",
              canSubmit ? "glass-tint-safe text-[color:var(--keel-ink)]" : "glass-clear opacity-40",
            )}
          >
            {pending ? "Understanding…" : "Capture"}
          </button>

          {error ? <p className="mt-3 text-sm text-[color:var(--keel-attend)]">{error}</p> : null}

          {preview?.kind === "unknown" ? (
            <div className="glass-clear mt-5 rounded-[var(--radius-lg)] p-4 text-sm leading-6 text-[color:var(--keel-ink-3)]">
              I can help with commitments, income, and assets — try &apos;my electricity is $240 a quarter&apos;
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

// --- Receipt card -------------------------------------------------------------

function ReceiptCard({
  preview,
  sentence,
  categories,
  onReset,
  onCommitted,
}: {
  preview: Extract<CaptureApiResponse, { kind: "commitment" | "income" | "asset" }>;
  sentence: string;
  categories: CategoryOption[];
  onReset: () => void;
  onCommitted: () => void;
}) {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState(
    preview.kind === "commitment" ? preview.payload.category : "",
  );

  const categoryOptions = useMemo(
    () => categories.map((c) => ({ value: c.name, label: c.name })),
    [categories],
  );

  const isNewCategory = category !== "" && categories.length > 0 &&
    !categories.some((c) => c.name.toLowerCase() === category.toLowerCase());

  async function commit() {
    setWorking(true);
    setError(null);
    try {
      if (preview.kind === "commitment") {
        await createCommitmentFromCapture({ ...preview.payload, category });
      } else if (preview.kind === "income") {
        await createIncomeFromCapture(preview.payload);
      } else if (preview.kind === "asset") {
        await createAssetFromCapture(preview.payload);
      }
      onCommitted();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unable to save.";
      setError(msg === "AI_CAPTURE_DISABLED" ? "Capture is offline right now." : msg);
    } finally {
      setWorking(false);
    }
  }

  const ctaLabel =
    preview.kind === "commitment"
      ? "Add to commitments"
      : preview.kind === "income"
        ? "Add as income"
        : "Add to wealth";

  return (
    <div className="space-y-3">
      {/* "You said" anchor */}
      {sentence ? (
        <div className="glass-clear rounded-[var(--radius-lg)] px-4 py-3">
          <p className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-[color:var(--keel-ink-4)]">
            You said
          </p>
          <p className="text-sm leading-6 text-[color:var(--keel-ink-2)]">{sentence}</p>
        </div>
      ) : null}

      {/* Receipt card */}
      <section className="glass-clear rounded-[var(--radius-xl)] p-4">
        <p className="mb-3 text-[10px] font-medium uppercase tracking-[0.14em] text-[color:var(--keel-safe-soft)]">
          Here&apos;s what I heard
        </p>

        {preview.kind === "commitment" && (
          <CommitmentReceipt
            payload={preview.payload}
            category={category}
            isNewCategory={isNewCategory}
            categoryOptions={categoryOptions}
            onCategoryChange={setCategory}
          />
        )}

        {preview.kind === "income" && <IncomeReceipt payload={preview.payload} />}

        {preview.kind === "asset" && <AssetReceipt payload={preview.payload} />}

        {error ? <p className="mt-3 text-sm text-[color:var(--keel-attend)]">{error}</p> : null}

        <button
          type="button"
          disabled={working}
          onClick={() => void commit()}
          className="mt-5 w-full rounded-[var(--radius-pill)] px-4 py-3 text-sm font-semibold text-[color:var(--keel-ink)] glass-tint-safe disabled:opacity-40"
        >
          {working ? "Adding…" : ctaLabel}
        </button>

        <button
          type="button"
          className="mt-3 w-full text-sm text-[color:var(--keel-ink-3)] hover:text-[color:var(--keel-ink-2)]"
          onClick={onReset}
        >
          Not quite right — tell Keel more
        </button>
      </section>
    </div>
  );
}

// --- Receipt sub-views --------------------------------------------------------

function CommitmentReceipt({
  payload,
  category,
  isNewCategory,
  categoryOptions,
  onCategoryChange,
}: {
  payload: CommitmentCapturePayload;
  category: string;
  isNewCategory: boolean;
  categoryOptions: { value: string; label: string }[];
  onCategoryChange: (v: string) => void;
}) {
  const [editingCategory, setEditingCategory] = useState(false);

  return (
    <>
      <h2 className="text-2xl font-bold text-[color:var(--keel-ink)]">{payload.name}</h2>
      <p className="mt-1 text-sm text-[color:var(--keel-ink-3)]">
        {buildDetailLine(payload.amount, payload.frequency, payload.nextDueDate)}
      </p>

      <div className="my-4 border-t border-white/10" />

      <div className="space-y-3">
        {/* Category */}
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-[color:var(--keel-ink-3)]">Category</span>
          {editingCategory && categoryOptions.length > 0 ? (
            <div className="w-44">
              <KeelSelect
                value={category}
                options={categoryOptions}
                onChange={(v) => {
                  onCategoryChange(v);
                  setEditingCategory(false);
                }}
                footer={
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-[color:var(--keel-ink-3)] hover:text-[color:var(--keel-ink)]"
                    onClick={() => setEditingCategory(false)}
                  >
                    <span className="text-[color:var(--keel-safe-soft)]">+</span> New category
                  </button>
                }
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => categoryOptions.length > 0 && setEditingCategory(true)}
              className={cn(
                "keel-chip text-xs",
                categoryOptions.length > 0 && "cursor-pointer hover:bg-white/10",
              )}
            >
              {category || "Uncategorised"}
              {isNewCategory && (
                <span className="ml-1 text-[color:var(--keel-safe-soft)]">&middot; new</span>
              )}
            </button>
          )}
        </div>

        {/* Per-pay reserve */}
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-[color:var(--keel-ink-3)]">Per-pay reserve</span>
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-sm tabular-nums text-[color:var(--keel-ink)]">
              {formatAudFixed(payload.perPay)}
            </span>
            {payload.perPayAuto && (
              <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-medium text-[color:var(--keel-ink-3)]">
                auto
              </span>
            )}
          </div>
        </div>

        {/* Funded from (default) */}
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-[color:var(--keel-ink-3)]">Funded from</span>
          <span className="text-sm text-[color:var(--keel-ink-2)]">Primary income</span>
        </div>
      </div>
    </>
  );
}

function IncomeReceipt({ payload }: { payload: IncomeCapturePayload }) {
  return (
    <>
      <h2 className="text-2xl font-bold text-[color:var(--keel-ink)]">{payload.name}</h2>
      <p className="mt-1 text-sm text-[color:var(--keel-ink-3)]">
        {buildDetailLine(payload.amount, payload.frequency, payload.nextPayDate)}
      </p>
      {payload.isPrimary && (
        <div className="mt-4">
          <span className="keel-chip text-xs text-[color:var(--keel-safe-soft)]">Primary income</span>
        </div>
      )}
    </>
  );
}

function AssetReceipt({ payload }: { payload: AssetCapturePayload }) {
  const value = payload.valueOverride ?? (payload.unitPrice != null ? payload.quantity * payload.unitPrice : null);
  return (
    <>
      <h2 className="text-2xl font-bold text-[color:var(--keel-ink)]">{payload.name}</h2>
      <p className="mt-1 text-sm text-[color:var(--keel-ink-3)]">
        {payload.assetType}
        {payload.symbol ? ` · ${payload.symbol}` : ""}
        {value != null ? ` · ${formatAudFixed(value)}` : ""}
      </p>
      {payload.quantity !== 1 && (
        <div className="my-4 border-t border-white/10" />
      )}
      {payload.quantity !== 1 && (
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-[color:var(--keel-ink-3)]">Quantity</span>
          <span className="font-mono text-sm text-[color:var(--keel-ink)]">{payload.quantity}</span>
        </div>
      )}
    </>
  );
}
