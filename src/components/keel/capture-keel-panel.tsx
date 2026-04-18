"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import {
  createAssetFromCapture,
  createCommitmentFromCapture,
  createIncomeFromCapture,
} from "@/app/actions/capture";
import type { AssetCapturePayload, CommitmentCapturePayload, IncomeCapturePayload } from "@/lib/ai/parse-capture";
import { cn, formatAud } from "@/lib/utils";

type CaptureApiResponse =
  | { kind: "unknown" }
  | { kind: "commitment"; payload: CommitmentCapturePayload }
  | { kind: "income"; payload: IncomeCapturePayload }
  | { kind: "asset"; payload: AssetCapturePayload };

export function CaptureKeelPanel() {
  const searchParams = useSearchParams();
  const forcedKindParam = searchParams.get("kind");
  const forcedKind =
    forcedKindParam === "commitment" || forcedKindParam === "income" || forcedKindParam === "asset"
      ? forcedKindParam
      : undefined;

  const [sentence, setSentence] = useState("");
  const [draftSentence, setDraftSentence] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<CaptureApiResponse | null>(null);

  const canSubmit = useMemo(() => sentence.trim().length > 0 && !pending, [sentence, pending]);

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
        body: JSON.stringify({
          sentence: trimmed,
          ...(forcedKind ? { forcedKind } : {}),
        }),
      });

      const json = (await res.json()) as CaptureApiResponse & { error?: string };

      if (!res.ok) {
        if (res.status === 503) {
          setError("Capture is offline right now.");
          return;
        }
        setError(json.error ?? "Unable to capture.");
        return;
      }

      if ("error" in json && json.error) {
        setError(json.error);
        return;
      }

      setPreview(json as CaptureApiResponse);
      setDraftSentence(trimmed);
    } catch {
      setError("Unable to capture.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="pb-28">
      <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/15" aria-hidden="true" />

      <div className="mb-4 flex items-center justify-end">
        <Link href="/ask" className="text-xs font-medium text-[color:var(--keel-ink-3)] hover:text-[color:var(--keel-ink-2)]">
          Ask
        </Link>
      </div>

      <label className="block">
        <span className="sr-only">Tell Keel what you want to add</span>
        <textarea
          value={sentence}
          onChange={(e) => setSentence(e.target.value)}
          placeholder="Tell Keel what you want to add"
          rows={3}
          className="glass-clear w-full resize-none rounded-[var(--radius-lg)] px-3 py-3 text-sm text-[color:var(--keel-ink)] outline-none placeholder:text-[color:var(--keel-ink-4)]"
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
        Capture
      </button>

      {error ? <p className="mt-3 text-sm text-[color:var(--keel-attend)]">{error}</p> : null}

      {preview?.kind === "unknown" ? (
        <div className="glass-clear mt-5 rounded-[var(--radius-lg)] p-4 text-sm leading-6 text-[color:var(--keel-ink-3)]">
          I can help with commitments, income, and assets — try &apos;my electricity is $240 a quarter&apos;
        </div>
      ) : null}

      {preview && preview.kind !== "unknown" ? (
        <PreviewCard
          preview={preview}
          onReset={() => {
            setSentence(draftSentence);
            setPreview(null);
          }}
          onCommitted={() => {
            setSentence("");
            setPreview(null);
            setDraftSentence("");
          }}
        />
      ) : null}
    </div>
  );
}

function PreviewCard({
  preview,
  onReset,
  onCommitted,
}: {
  preview: Extract<CaptureApiResponse, { kind: "commitment" | "income" | "asset" }>;
  onReset: () => void;
  onCommitted: () => void;
}) {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [commitment, setCommitment] = useState<CommitmentCapturePayload | null>(
    preview.kind === "commitment" ? preview.payload : null,
  );
  const [income, setIncome] = useState<IncomeCapturePayload | null>(preview.kind === "income" ? preview.payload : null);
  const [asset, setAsset] = useState<AssetCapturePayload | null>(preview.kind === "asset" ? preview.payload : null);

  async function commit() {
    setWorking(true);
    setError(null);
    try {
      if (preview.kind === "commitment" && commitment) {
        await createCommitmentFromCapture(commitment);
      } else if (preview.kind === "income" && income) {
        await createIncomeFromCapture(income);
      } else if (preview.kind === "asset" && asset) {
        await createAssetFromCapture(asset);
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
    preview.kind === "commitment" ? "Add to Commitments" : preview.kind === "income" ? "Add as Income" : "Add to Wealth";

  return (
    <section className="glass-clear mt-5 rounded-[var(--radius-xl)] p-4">
      <div className="space-y-3">
        {preview.kind === "commitment" && commitment ? (
          <>
            <Field label="Name" value={commitment.name} onChange={(v) => setCommitment({ ...commitment, name: v })} />
            <Field
              label="Amount"
              value={String(commitment.amount)}
              onChange={(v) => setCommitment({ ...commitment, amount: Number.parseFloat(v || "0") })}
            />
            <Field
              label="Frequency"
              value={commitment.frequency}
              onChange={(v) =>
                setCommitment({ ...commitment, frequency: v as CommitmentCapturePayload["frequency"] })
              }
            />
            <Field
              label="Next due"
              value={commitment.nextDueDate ?? ""}
              onChange={(v) => setCommitment({ ...commitment, nextDueDate: v ? v : null })}
            />
            <Field label="Category" value={commitment.category} onChange={(v) => setCommitment({ ...commitment, category: v })} />
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-[color:var(--keel-ink-3)]">Per-pay reserve</span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm tabular-nums text-[color:var(--keel-ink)]">{formatAud(commitment.perPay)}</span>
                {commitment.perPayAuto ? (
                  <span className="rounded-full bg-white/5 px-2 py-1 text-[10px] font-semibold text-[color:var(--keel-ink-3)]">
                    Auto
                  </span>
                ) : null}
              </div>
            </div>
          </>
        ) : null}

        {preview.kind === "income" && income ? (
          <>
            <Field label="Name" value={income.name} onChange={(v) => setIncome({ ...income, name: v })} />
            <Field
              label="Amount"
              value={String(income.amount)}
              onChange={(v) => setIncome({ ...income, amount: Number.parseFloat(v || "0") })}
            />
            <Field
              label="Frequency"
              value={income.frequency}
              onChange={(v) => setIncome({ ...income, frequency: v as IncomeCapturePayload["frequency"] })}
            />
            <Field
              label="Next pay"
              value={income.nextPayDate ?? ""}
              onChange={(v) => setIncome({ ...income, nextPayDate: v ? v : null })}
            />
            <label className="flex items-center justify-between gap-3 text-sm text-[color:var(--keel-ink-2)]">
              <span>Primary income</span>
              <input
                type="checkbox"
                checked={Boolean(income.isPrimary)}
                onChange={(e) => setIncome({ ...income, isPrimary: e.target.checked })}
              />
            </label>
          </>
        ) : null}

        {preview.kind === "asset" && asset ? (
          <>
            <Field label="Name" value={asset.name} onChange={(v) => setAsset({ ...asset, name: v })} />
            <Field label="Type" value={asset.assetType} onChange={(v) => setAsset({ ...asset, assetType: v })} />
            <Field label="Symbol" value={asset.symbol ?? ""} onChange={(v) => setAsset({ ...asset, symbol: v || null })} />
            <Field
              label="Quantity"
              value={String(asset.quantity)}
              onChange={(v) => setAsset({ ...asset, quantity: Number.parseFloat(v || "0") })}
            />
            <Field
              label="Unit price"
              value={asset.unitPrice == null ? "" : String(asset.unitPrice)}
              onChange={(v) => setAsset({ ...asset, unitPrice: v ? Number.parseFloat(v) : null })}
            />
            <Field
              label="Value override"
              value={asset.valueOverride == null ? "" : String(asset.valueOverride)}
              onChange={(v) => setAsset({ ...asset, valueOverride: v ? Number.parseFloat(v) : null })}
            />
          </>
        ) : null}
      </div>

      {error ? <p className="mt-3 text-sm text-[color:var(--keel-attend)]">{error}</p> : null}

      <button
        type="button"
        disabled={working}
        onClick={() => void commit()}
        className="glass-tint-safe mt-4 w-full rounded-[var(--radius-pill)] px-4 py-3 text-sm font-semibold text-[color:var(--keel-ink)] disabled:opacity-40"
      >
        {ctaLabel}
      </button>

      <button type="button" className="mt-3 w-full text-sm text-[color:var(--keel-ink-3)]" onClick={onReset}>
        Not quite right — tell Keel more
      </button>
    </section>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (next: string) => void }) {
  return (
    <label className="block">
      <span className="text-[11px] font-medium text-[color:var(--keel-ink-4)]">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-[var(--radius-md)] bg-black/25 px-3 py-2 text-sm text-[color:var(--keel-ink)] outline-none ring-1 ring-white/10"
      />
    </label>
  );
}
