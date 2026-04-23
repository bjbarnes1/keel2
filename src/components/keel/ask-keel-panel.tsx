"use client";

/**
 * Ask Keel chat UI: POSTs to `/api/ask-keel` (JSON or optional NDJSON streaming), renders
 * structured cards, citations, scenario deltas, and chips.
 *
 * @module components/keel/ask-keel-panel
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import type { AskKeelResponse } from "@/lib/ai/ask-keel-schema";
import { encodeCapturePrefillPayload } from "@/lib/ai/capture-prefill";
import { cn, formatAud } from "@/lib/utils";

type Chip = string | { text: string; action?: string };

type ChatMessage = {
  role: "user" | "assistant";
  text: string;
  payload?: AskKeelResponse;
  /** When true, `text` holds streamed prose before the final structured payload is applied. */
  streaming?: boolean;
};

function chipText(chip: Chip) {
  return typeof chip === "string" ? chip : chip.text;
}

function chipAction(chip: Chip) {
  return typeof chip === "string" ? undefined : chip.action;
}

function parseSkipCommitmentAction(action: string) {
  const match = /^skip_commitment:(.+):(\d{4}-\d{2}-\d{2})$/.exec(action);
  if (!match) {
    return null;
  }
  return { commitmentId: match[1]!, iso: match[2]! };
}

function parseSkipIncomeAction(action: string) {
  const match = /^skip_income:(.+):(\d{4}-\d{2}-\d{2})$/.exec(action);
  if (!match) {
    return null;
  }
  return { incomeId: match[1]!, iso: match[2]! };
}

function parseSkipGoalAction(action: string) {
  const match = /^skip_goal:(.+):(\d{4}-\d{2}-\d{2})$/.exec(action);
  if (!match) {
    return null;
  }
  return { goalId: match[1]!, iso: match[2]! };
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
          <path
            d="M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3Z"
            stroke="currentColor"
            strokeWidth="1.7"
          />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          <path d="M12 19v3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
        <span className="sr-only">Voice</span>
      </button>
      {open ? (
        <div className="absolute bottom-12 right-0 z-50 rounded-[var(--radius-md)] border border-white/10 bg-[color:var(--keel-tide-2)] px-3 py-2 text-xs text-[color:var(--keel-ink-2)] shadow-lg">
          Voice coming soon
        </div>
      ) : null}
    </div>
  );
}

export function AskKeelPanel() {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [streamAnswers, setStreamAnswers] = useState(true);

  const canSend = useMemo(() => input.trim().length > 0 && !pending, [input, pending]);

  async function sendNonStreaming(trimmed: string) {
    const res = await fetch("/api/ask-keel", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: trimmed, stream: false }),
    });

    if (res.status === 429) {
      const msg = (await res.json()) as { error?: string };
      setMessages((prev) => [...prev, { role: "assistant", text: msg.error ?? "Please try again later." }]);
      return;
    }

    const json = (await res.json()) as { data?: AskKeelResponse; error?: string };
    const data = json.data;
    if (!data) {
      setMessages((prev) => [...prev, { role: "assistant", text: json.error ?? "Ask is offline right now." }]);
      return;
    }

    if (data.type === "capture_redirect") {
      setMessages((prev) => [...prev, { role: "assistant", text: data.headline, payload: data }]);
      router.push(`/capture?prefill=${encodeCapturePrefillPayload({ sentence: data.sentence, capture: data.capture })}`);
      return;
    }

    setMessages((prev) => [...prev, { role: "assistant", text: data.headline, payload: data }]);
  }

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;

    setPending(true);
    setMessages((prev) => [...prev, { role: "user", text: trimmed }]);
    setInput("");

    try {
      if (streamAnswers) {
        const res = await fetch("/api/ask-keel", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ message: trimmed, stream: true }),
        });

        if (res.status === 429) {
          const msg = (await res.json()) as { error?: string };
          setMessages((prev) => [
            ...prev,
            { role: "assistant", text: msg.error ?? "Please try again later." },
          ]);
          return;
        }

        if (!res.ok) {
          let errText = "Ask is offline right now.";
          try {
            const errJson = (await res.json()) as { error?: string };
            if (errJson.error) errText = errJson.error;
          } catch {
            /* ignore */
          }
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

          const applyLast = (patch: Partial<ChatMessage>) => {
            setMessages((prev) => {
              const next = [...prev];
              const last = next.length - 1;
              if (last < 0) return prev;
              next[last] = { ...next[last]!, ...patch };
              return next;
            });
          };

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            for (const line of lines) {
              if (!line.trim()) continue;
              let ev: { type?: string; delta?: string; data?: AskKeelResponse };
              try {
                ev = JSON.parse(line) as typeof ev;
              } catch {
                continue;
              }
              if (ev.type === "text" && typeof ev.delta === "string") {
                streamText += ev.delta;
                applyLast({ text: streamText, streaming: true });
              }
              if (ev.type === "complete" && ev.data) {
                completed = true;
                applyLast({
                  text: ev.data.headline,
                  payload: ev.data,
                  streaming: false,
                });
              }
            }
          }
          if (buffer.trim()) {
            try {
              const ev = JSON.parse(buffer) as { type?: string; data?: AskKeelResponse };
              if (ev.type === "complete" && ev.data) {
                completed = true;
                applyLast({
                  text: ev.data.headline,
                  payload: ev.data,
                  streaming: false,
                });
              }
            } catch {
              /* ignore trailing partial */
            }
          }

          if (!completed) {
            applyLast({
              role: "assistant",
              text: "Ask is offline right now.",
              streaming: false,
            });
          }
          return;
        }
      }

      await sendNonStreaming(trimmed);
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", text: "Ask is offline right now." }]);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="pb-28">
      <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/15" aria-hidden="true" />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <label className="flex cursor-pointer items-center gap-2 text-[11px] text-[color:var(--keel-ink-4)]">
          <input
            type="checkbox"
            className="accent-[color:var(--keel-safe-soft)]"
            checked={streamAnswers}
            onChange={(e) => setStreamAnswers(e.target.checked)}
            aria-label="Stream short answers as they are typed"
          />
          Stream short answers
        </label>
        <Link href="/capture" className="text-xs font-medium text-[color:var(--keel-ink-3)] hover:text-[color:var(--keel-ink-2)]">
          Capture
        </Link>
      </div>

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

              {message.payload?.type === "spending_summary" ? (
                <div className="mt-2 space-y-1">
                  {message.payload.breakdown.map((row) => (
                    <div key={row.label} className="flex items-center justify-between gap-3 text-xs">
                      <span className="text-[color:var(--keel-ink-3)]">{row.label}</span>
                      <span className="font-mono tabular-nums text-[color:var(--keel-ink)]">{formatAud(row.amount)}</span>
                    </div>
                  ))}
                </div>
              ) : null}

              {message.payload?.type === "goal_projection" ? (
                <div className="mt-2 text-xs text-[color:var(--keel-ink-3)]">
                  <div className="flex items-end justify-between gap-3">
                    <span>Now</span>
                    <span className="font-mono tabular-nums text-[color:var(--keel-ink)]">
                      {formatAud(message.payload.chart.todayValue)}
                    </span>
                  </div>
                  <div className="mt-1 flex items-end justify-between gap-3">
                    <span>{message.payload.chart.targetLabel}</span>
                    <span className="font-mono tabular-nums text-[color:var(--keel-ink)]">
                      {formatAud(message.payload.chart.targetValue)}
                    </span>
                  </div>
                </div>
              ) : null}

              {message.payload?.type === "freeform" && message.payload.body ? (
                <p className="mt-2 text-xs leading-6 text-[color:var(--keel-ink-3)]">{message.payload.body}</p>
              ) : null}

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
                          {c.amount != null ? formatAud(c.amount) : c.dateIso ?? c.label}
                        </span>
                      );
                      return (
                        <li key={`${c.ref}-${c.label}`}>
                          {href ? (
                            <Link
                              href={href}
                              className="keel-chip inline-flex items-center gap-1 px-2 py-1 text-[11px] text-[color:var(--keel-ink-2)] underline-offset-2 hover:underline"
                            >
                              {c.label} · {inner}
                            </Link>
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

              {message.payload?.type === "freeform" && message.payload.confidence === "low" ? (
                <p className="mt-2 text-[11px] text-[color:var(--keel-ink-5)]">Low confidence — double-check in Timeline.</p>
              ) : null}

              {message.payload?.type === "freeform" && message.payload.answerValidationFailed ? (
                <p className="mt-1 text-[11px] text-[color:var(--keel-ink-4)]">Something didn&apos;t line up with your snapshot.</p>
              ) : null}

              {message.payload?.type === "scenario_whatif" && message.payload.body ? (
                <div className="mt-2 space-y-2 text-xs leading-6 text-[color:var(--keel-ink-3)]">
                  <p className="whitespace-pre-line">{message.payload.body}</p>
                  <p className="font-mono text-[color:var(--keel-ink-2)]">
                    {message.payload.deltas.baselineEndProjectedAvailableMoney != null ? (
                      <>
                        Baseline end {formatAud(message.payload.deltas.baselineEndProjectedAvailableMoney)} · Scenario end{" "}
                        {formatAud(message.payload.deltas.endProjectedAvailableMoney)} · Delta{" "}
                        {formatAud(message.payload.deltas.endAvailableMoneyDelta)}
                      </>
                    ) : (
                      <>
                        End balance {formatAud(message.payload.deltas.endProjectedAvailableMoney)} · Delta{" "}
                        {formatAud(message.payload.deltas.endAvailableMoneyDelta)}
                      </>
                    )}
                  </p>
                </div>
              ) : null}

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
                        onClick={() => {
                          if (!action) {
                            void send(label);
                            return;
                          }
                          const bill = parseSkipCommitmentAction(action);
                          if (bill) {
                            router.push(
                              `/commitments/${bill.commitmentId}?skipDate=${encodeURIComponent(bill.iso)}`,
                            );
                            return;
                          }
                          const income = parseSkipIncomeAction(action);
                          if (income) {
                            router.push(`/incomes/${income.incomeId}`);
                            return;
                          }
                          const goal = parseSkipGoalAction(action);
                          if (goal) {
                            router.push(`/goals/${goal.goalId}?skipDate=${encodeURIComponent(goal.iso)}`);
                            return;
                          }
                          void send(label);
                        }}
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

      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(96px+env(safe-area-inset-bottom))] z-40 flex justify-center px-5">
        <div className="pointer-events-auto glass-heavy flex w-full max-w-[520px] items-center gap-2 rounded-[var(--radius-pill)] px-3 py-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask Keel…"
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
