"use client";

/**
 * Ask Keel chat UI. Posts to `/api/ask-keel` (NDJSON streaming), renders structured
 * cards, inline capture confirmations, citations, scenario deltas, and chips.
 *
 * Capture-shaped inputs are handled inline — the AI classifies them, the panel shows
 * a compact confirmation card with Add / Review actions. No page navigation needed.
 *
 * @module components/keel/ask-keel-panel
 */

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import {
  createAssetFromCapture,
  createCommitmentFromCapture,
  createIncomeFromCapture,
} from "@/app/actions/capture";
import type { AskKeelResponse } from "@/lib/ai/ask-keel-schema";
import { encodeCapturePrefillPayload } from "@/lib/ai/capture-prefill";
import type { CommitmentCapturePayload, IncomeCapturePayload, AssetCapturePayload } from "@/lib/ai/capture-schemas";
import { cn, formatAudFixed, formatDisplayDate } from "@/lib/utils";

type Chip = string | { text: string; action?: string };

type ChatMessage = {
  role: "user" | "assistant";
  text: string;
  payload?: AskKeelResponse;
  streaming?: boolean;
};

// --- Helpers ------------------------------------------------------------------

function chipText(chip: Chip) {
  return typeof chip === "string" ? chip : chip.text;
}
function chipAction(chip: Chip) {
  return typeof chip === "string" ? undefined : chip.action;
}

function parseSkipCommitmentAction(action: string) {
  const m = /^skip_commitment:(.+):(\d{4}-\d{2}-\d{2})$/.exec(action);
  return m ? { commitmentId: m[1]!, iso: m[2]! } : null;
}
function parseSkipIncomeAction(action: string) {
  const m = /^skip_income:(.+):(\d{4}-\d{2}-\d{2})$/.exec(action);
  return m ? { incomeId: m[1]!, iso: m[2]! } : null;
}
function parseSkipGoalAction(action: string) {
  const m = /^skip_goal:(.+):(\d{4}-\d{2}-\d{2})$/.exec(action);
  return m ? { goalId: m[1]!, iso: m[2]! } : null;
}

function citationHref(ref: string): string | null {
  const inc = /^income:([^:]+):/.exec(ref);
  if (inc) return `/incomes/${inc[1]}`;
  const com = /^commitment:([^:]+):/.exec(ref);
  if (com) return `/commitments/${com[1]}`;
  const goal = /^goal:([^:]+):/.exec(ref);
  if (goal) return `/goals/${goal[1]}`;
  return null;
}

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

function captureDetailLine(
  payload: CommitmentCapturePayload | IncomeCapturePayload | AssetCapturePayload,
  kind: "commitment" | "income" | "asset",
): string {
  if (kind === "commitment") {
    const p = payload as CommitmentCapturePayload;
    const parts = [`${formatAudFixed(p.amount)} ${frequencyPhrase(p.frequency)}`];
    if (p.nextDueDate) parts.push(`starts ${formatDisplayDate(p.nextDueDate, "short-day")}`);
    return parts.join(" · ");
  }
  if (kind === "income") {
    const p = payload as IncomeCapturePayload;
    const parts = [`${formatAudFixed(p.amount)} ${frequencyPhrase(p.frequency)}`];
    if (p.nextPayDate) parts.push(`starts ${formatDisplayDate(p.nextPayDate, "short-day")}`);
    return parts.join(" · ");
  }
  const p = payload as AssetCapturePayload;
  const value = p.valueOverride ?? (p.unitPrice != null ? p.quantity * p.unitPrice : null);
  return [p.assetType, value != null ? formatAudFixed(value) : null].filter(Boolean).join(" · ");
}

// --- MicDisabledButton --------------------------------------------------------

function MicDisabledButton() {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        className="inline-flex h-10 w-10 items-center justify-center rounded-full text-[color:var(--keel-ink-3)] opacity-50"
        aria-disabled="true"
        onClick={() => setOpen((v) => !v)}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3Z" stroke="currentColor" strokeWidth="1.7" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          <path d="M12 19v3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
        <span className="sr-only">Voice</span>
      </button>
      {open && (
        <div className="absolute bottom-12 right-0 z-50 rounded-[var(--radius-md)] border border-white/10 bg-[color:var(--keel-tide-2)] px-3 py-2 text-xs text-[color:var(--keel-ink-2)] shadow-lg">
          Voice coming soon
        </div>
      )}
    </div>
  );
}

// --- Inline capture card ------------------------------------------------------

function InlineCaptureCard({
  capture,
  sentence,
  onAdded,
}: {
  capture: Extract<AskKeelResponse, { type: "capture_redirect" }>["capture"];
  sentence: string;
  onAdded: () => void;
}) {
  const router = useRouter();
  const [working, setWorking] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    setWorking(true);
    setError(null);
    try {
      if (capture.kind === "commitment") await createCommitmentFromCapture(capture.payload);
      else if (capture.kind === "income") await createIncomeFromCapture(capture.payload);
      else if (capture.kind === "asset") await createAssetFromCapture(capture.payload);
      setDone(true);
      onAdded();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save.");
    } finally {
      setWorking(false);
    }
  }

  function review() {
    router.push(`/capture?prefill=${encodeCapturePrefillPayload({ sentence, capture })}`);
  }

  const name = capture.payload.name;
  const detail = captureDetailLine(capture.payload, capture.kind);

  if (done) {
    return (
      <div className="mt-2 rounded-[var(--radius-md)] bg-white/5 px-3 py-2 text-xs text-[color:var(--keel-safe-soft)]">
        Added. Check your{" "}
        {capture.kind === "commitment" ? "commitments" : capture.kind === "income" ? "incomes" : "wealth"}.
      </div>
    );
  }

  return (
    <div className="mt-2 rounded-[var(--radius-lg)] bg-white/5 px-3 py-3">
      <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-[color:var(--keel-ink-4)]">Capture</p>
      <p className="mt-1 font-semibold text-[color:var(--keel-ink)]">{name}</p>
      <p className="text-xs text-[color:var(--keel-ink-3)]">{detail}</p>
      {error && <p className="mt-1 text-xs text-[color:var(--keel-attend)]">{error}</p>}
      <div className="mt-2.5 flex gap-2">
        <button
          type="button"
          disabled={working}
          onClick={() => void add()}
          className="flex-1 rounded-[var(--radius-pill)] bg-[color:var(--keel-safe-soft)] px-4 py-2 text-xs font-semibold text-black disabled:opacity-40"
        >
          {working ? "Adding…" : "Add"}
        </button>
        <button
          type="button"
          onClick={review}
          className="flex-1 rounded-[var(--radius-pill)] glass-clear px-4 py-2 text-xs text-[color:var(--keel-ink-2)]"
        >
          Review
        </button>
      </div>
    </div>
  );
}

// --- Main panel ---------------------------------------------------------------

export function AskKeelPanel() {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);

  const canSend = useMemo(() => input.trim().length > 0 && !pending, [input, pending]);

  const applyLast = (patch: Partial<ChatMessage>) => {
    setMessages((prev) => {
      const next = [...prev];
      const last = next.length - 1;
      if (last < 0) return prev;
      next[last] = { ...next[last]!, ...patch };
      return next;
    });
  };

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;

    setPending(true);
    setMessages((prev) => [...prev, { role: "user", text: trimmed }]);
    setInput("");

    try {
      const res = await fetch("/api/ask-keel", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: trimmed, stream: true }),
      });

      if (res.status === 429) {
        const msg = (await res.json()) as { error?: string };
        setMessages((prev) => [...prev, { role: "assistant", text: msg.error ?? "Please try again later." }]);
        return;
      }

      if (!res.ok) {
        let errText = "Ask is offline right now.";
        try {
          const errJson = (await res.json()) as { error?: string };
          if (errJson.error) errText = errJson.error;
        } catch { /* ignore */ }
        setMessages((prev) => [...prev, { role: "assistant", text: errText }]);
        return;
      }

      const ctype = res.headers.get("content-type") ?? "";
      if (res.body && ctype.includes("ndjson")) {
        setMessages((prev) => [...prev, { role: "assistant", text: "", streaming: true }]);

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let streamText = "";
        let completed = false;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            let ev: { type?: string; delta?: string; data?: AskKeelResponse };
            try { ev = JSON.parse(line) as typeof ev; } catch { continue; }
            if (ev.type === "text" && typeof ev.delta === "string") {
              streamText += ev.delta;
              applyLast({ text: streamText, streaming: true });
            }
            if (ev.type === "complete" && ev.data) {
              completed = true;
              applyLast({ text: ev.data.headline, payload: ev.data, streaming: false });
            }
          }
        }
        if (buffer.trim()) {
          try {
            const ev = JSON.parse(buffer) as { type?: string; data?: AskKeelResponse };
            if (ev.type === "complete" && ev.data) {
              completed = true;
              applyLast({ text: ev.data.headline, payload: ev.data, streaming: false });
            }
          } catch { /* ignore */ }
        }
        if (!completed) {
          applyLast({ text: "Ask is offline right now.", streaming: false });
        }
        return;
      }

      // Non-streaming fallback
      const json = (await res.json()) as { data?: AskKeelResponse; error?: string };
      const data = json.data;
      if (!data) {
        setMessages((prev) => [...prev, { role: "assistant", text: json.error ?? "Ask is offline right now." }]);
        return;
      }
      setMessages((prev) => [...prev, { role: "assistant", text: data.headline, payload: data }]);
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", text: "Ask is offline right now." }]);
    } finally {
      setPending(false);
    }
  }

  function handleChipAction(label: string, action?: string) {
    if (!action) { void send(label); return; }

    // navigate: prefix — go to any internal path
    if (action.startsWith("navigate:")) {
      router.push(action.slice("navigate:".length));
      return;
    }
    const bill = parseSkipCommitmentAction(action);
    if (bill) { router.push(`/commitments/${bill.commitmentId}?skipDate=${encodeURIComponent(bill.iso)}`); return; }
    const income = parseSkipIncomeAction(action);
    if (income) { router.push(`/incomes/${income.incomeId}`); return; }
    const goal = parseSkipGoalAction(action);
    if (goal) { router.push(`/goals/${goal.goalId}?skipDate=${encodeURIComponent(goal.iso)}`); return; }

    void send(label);
  }

  return (
    <div className="pb-28">
      <div className="space-y-3" role="log" aria-relevant="additions" aria-label="Ask Keel conversation">
        {messages.map((message, idx) => (
          <div key={idx} className={message.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div
              className={cn(
                "max-w-[92%] rounded-[var(--radius-lg)] px-3 py-2 text-sm leading-6",
                message.role === "user" ? "glass-tint-safe" : "glass-clear",
              )}
              {...(message.streaming ? { "aria-live": "polite" as const } : {})}
            >
              <p className="font-medium text-[color:var(--keel-ink)]">{message.text}</p>

              {/* Spending summary */}
              {message.payload?.type === "spending_summary" && (
                <div className="mt-2 space-y-1">
                  {message.payload.breakdown.map((row) => (
                    <div key={row.label} className="flex items-center justify-between gap-3 text-xs">
                      <span className="text-[color:var(--keel-ink-3)]">{row.label}</span>
                      <span className="font-mono tabular-nums text-[color:var(--keel-ink)]">{formatAudFixed(row.amount)}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Goal projection */}
              {message.payload?.type === "goal_projection" && (
                <div className="mt-2 text-xs text-[color:var(--keel-ink-3)]">
                  <div className="flex items-end justify-between gap-3">
                    <span>Now</span>
                    <span className="font-mono tabular-nums text-[color:var(--keel-ink)]">
                      {formatAudFixed(message.payload.chart.todayValue)}
                    </span>
                  </div>
                  <div className="mt-1 flex items-end justify-between gap-3">
                    <span>{message.payload.chart.targetLabel}</span>
                    <span className="font-mono tabular-nums text-[color:var(--keel-ink)]">
                      {formatAudFixed(message.payload.chart.targetValue)}
                    </span>
                  </div>
                </div>
              )}

              {/* Freeform body */}
              {message.payload?.type === "freeform" && message.payload.body && (
                <p className="mt-2 text-xs leading-6 text-[color:var(--keel-ink-3)]">{message.payload.body}</p>
              )}

              {/* Citations */}
              {message.payload?.type === "freeform" && message.payload.citations?.length ? (
                <div className="mt-2 border-t border-white/10 pt-2">
                  <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-[color:var(--keel-ink-5)]">
                    Based on
                  </p>
                  <ul className="mt-1 flex flex-wrap gap-2">
                    {message.payload.citations.map((c) => {
                      const href = citationHref(c.ref);
                      const inner = (
                        <span className="font-mono tabular-nums text-[color:var(--keel-ink)]">
                          {c.amount != null ? formatAudFixed(c.amount) : c.dateIso ?? c.label}
                        </span>
                      );
                      return (
                        <li key={`${c.ref}-${c.label}`}>
                          {href ? (
                            <a
                              href={href}
                              className="keel-chip inline-flex items-center gap-1 px-2 py-1 text-[11px] text-[color:var(--keel-ink-2)] underline-offset-2 hover:underline"
                            >
                              {c.label} · {inner}
                            </a>
                          ) : (
                            <span className="keel-chip inline-flex items-center gap-1 px-2 py-1 text-[11px] text-[color:var(--keel-ink-2)]">
                              {c.label} · {inner}
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}

              {message.payload?.type === "freeform" && message.payload.confidence === "low" && (
                <p className="mt-2 text-[11px] text-[color:var(--keel-ink-5)]">Low confidence — double-check in Timeline.</p>
              )}
              {message.payload?.type === "freeform" && message.payload.answerValidationFailed && (
                <p className="mt-1 text-[11px] text-[color:var(--keel-ink-4)]">Something didn&apos;t line up with your snapshot.</p>
              )}

              {/* Scenario whatif */}
              {message.payload?.type === "scenario_whatif" && message.payload.body && (
                <div className="mt-2 space-y-2 text-xs leading-6 text-[color:var(--keel-ink-3)]">
                  <p className="whitespace-pre-line">{message.payload.body}</p>
                  <p className="font-mono text-[color:var(--keel-ink-2)]">
                    {message.payload.deltas.baselineEndProjectedAvailableMoney != null ? (
                      <>
                        Baseline end {formatAudFixed(message.payload.deltas.baselineEndProjectedAvailableMoney)} ·{" "}
                        Scenario end {formatAudFixed(message.payload.deltas.endProjectedAvailableMoney)} ·{" "}
                        Delta {formatAudFixed(message.payload.deltas.endAvailableMoneyDelta)}
                      </>
                    ) : (
                      <>
                        End balance {formatAudFixed(message.payload.deltas.endProjectedAvailableMoney)} ·{" "}
                        Delta {formatAudFixed(message.payload.deltas.endAvailableMoneyDelta)}
                      </>
                    )}
                  </p>
                </div>
              )}

              {/* Inline capture card — no page navigation */}
              {message.payload?.type === "capture_redirect" && (
                <InlineCaptureCard
                  capture={message.payload.capture}
                  sentence={message.payload.sentence}
                  onAdded={() => { /* already handled by done state inside card */ }}
                />
              )}

              {/* Chips */}
              {message.payload && "chips" in message.payload && message.payload.chips?.length ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {message.payload.chips.map((chip, chipIdx) => {
                    const label = chipText(chip as Chip);
                    const action = chipAction(chip as Chip);
                    return (
                      <button
                        key={`${label}-${chipIdx}`}
                        type="button"
                        className="keel-chip px-3 py-1 text-xs text-[color:var(--keel-ink-2)]"
                        onClick={() => handleChipAction(label, action)}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      {/* Input bar */}
      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(96px+env(safe-area-inset-bottom))] z-40 flex justify-center px-5">
        <div className="pointer-events-auto glass-heavy flex w-full max-w-[520px] items-center gap-2 rounded-[var(--radius-pill)] px-3 py-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about your money..."
            aria-label="Message to Ask Keel"
            autoComplete="off"
            className="min-w-0 flex-1 bg-transparent px-2 py-2 text-sm text-[color:var(--keel-ink)] outline-none placeholder:text-[color:var(--keel-ink-4)]"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (canSend) void send(input);
              }
            }}
          />
          <MicDisabledButton />
        </div>
      </div>
    </div>
  );
}
