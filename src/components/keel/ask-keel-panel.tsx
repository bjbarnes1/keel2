"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import type { AskKeelResponse } from "@/app/api/ask-keel/route";
import { cn, formatAud } from "@/lib/utils";

type Chip = string | { text: string; action?: string };

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

function parseSkipGoalAction(action: string) {
  const match = /^skip_goal:(.+):(\d{4}-\d{2}-\d{2})$/.exec(action);
  if (!match) {
    return null;
  }
  return { goalId: match[1]!, iso: match[2]! };
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
  const [messages, setMessages] = useState<Array<{ role: "user" | "assistant"; text: string; payload?: AskKeelResponse }>>(
    [],
  );
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);

  const canSend = useMemo(() => input.trim().length > 0 && !pending, [input, pending]);

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
        body: JSON.stringify({ message: trimmed }),
      });

      if (res.status === 429) {
        const msg = (await res.json()) as { error?: string };
        setMessages((prev) => [
          ...prev,
          { role: "assistant", text: msg.error ?? "Please try again later." },
        ]);
        return;
      }

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

  return (
    <div className="pb-28">
      <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/15" aria-hidden="true" />

      <div className="mb-4 flex items-center justify-end">
        <Link href="/capture" className="text-xs font-medium text-[color:var(--keel-ink-3)] hover:text-[color:var(--keel-ink-2)]">
          Capture
        </Link>
      </div>

      <div className="space-y-3">
        {messages.map((message, idx) => (
          <div key={idx} className={message.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div
              className={cn(
                "max-w-[92%] rounded-[var(--radius-lg)] px-3 py-2 text-sm leading-6",
                message.role === "user" ? "glass-tint-safe" : "glass-clear",
              )}
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

              {message.payload?.type === "scenario_whatif" && message.payload.body ? (
                <div className="mt-2 space-y-2 text-xs leading-6 text-[color:var(--keel-ink-3)]">
                  <p>{message.payload.body}</p>
                  <p className="font-mono text-[color:var(--keel-ink-2)]">
                    End balance {formatAud(message.payload.deltas.endProjectedAvailableMoney)} · Delta{" "}
                    {formatAud(message.payload.deltas.endAvailableMoneyDelta)}
                  </p>
                </div>
              ) : null}

              {message.payload?.chips?.length ? (
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
                            router.push(`/bills/${bill.commitmentId}/edit?skipDate=${encodeURIComponent(bill.iso)}`);
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
        <div className="pointer-events-auto glass-heavy flex w-full max-w-[420px] items-center gap-2 rounded-[var(--radius-pill)] px-3 py-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask Keel…"
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
