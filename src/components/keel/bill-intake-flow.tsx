"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { SurfaceCard } from "@/components/keel/primitives";
import { formatAud } from "@/lib/utils";

type ParsedBill = {
  name: string;
  amount: number;
  frequency: string;
  nextDueDate: string | null;
  category: string;
  perPay: number;
};

const examples = [
  {
    prompt: "Car insurance is $480 every quarter, due June 15",
    parsed: {
      name: "Car Insurance",
      amount: 480,
      frequency: "Quarterly",
      nextDueDate: "Jun 15, 2026",
      category: "Insurance",
      perPay: 80,
    },
  },
  {
    prompt: "Netflix 22.99 a month renews on the 19th",
    parsed: {
      name: "Netflix",
      amount: 22.99,
      frequency: "Monthly",
      nextDueDate: "Apr 19, 2026",
      category: "Subscriptions",
      perPay: 11.5,
    },
  },
  {
    prompt: "School fees 4500 per term next one July 1",
    parsed: {
      name: "School Fees",
      amount: 4500,
      frequency: "Quarterly",
      nextDueDate: "Jul 1, 2026",
      category: "Education",
      perPay: 750,
    },
  },
  {
    prompt: "Electricity roughly 320 a quarter not sure when its due",
    parsed: {
      name: "Electricity",
      amount: 320,
      frequency: "Quarterly",
      nextDueDate: null,
      category: "Utilities",
      perPay: 53.33,
    },
  },
];

type FlowState = "input" | "thinking" | "confirm" | "saved";

export function BillIntakeFlow() {
  const [text, setText] = useState("");
  const [flowState, setFlowState] = useState<FlowState>("input");
  const [parsedBill, setParsedBill] = useState<ParsedBill | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const canSubmit = text.trim().length > 5;

  const suggestions = useMemo(() => examples.map((example) => example.prompt), []);

  async function submit(description = text) {
    if (!description.trim()) {
      return;
    }

    setText(description);
    setErrorMessage(null);
    setFlowState("thinking");

    try {
      const response = await fetch("/api/parse-bill", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ description }),
      });

      const payload = (await response.json()) as
        | { success: true; data: ParsedBill }
        | { success: false; error: string };

      if (!payload.success) {
        throw new Error(payload.error);
      }

      setParsedBill({
        ...payload.data,
        frequency:
          payload.data.frequency.charAt(0).toUpperCase() +
          payload.data.frequency.slice(1),
        nextDueDate: payload.data.nextDueDate,
      });
      setFlowState("confirm");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to parse bill.",
      );
      setFlowState("input");
    }
  }

  function reset() {
    setText("");
    setParsedBill(null);
    setFlowState("input");
  }

  if (flowState === "saved" && parsedBill) {
    return (
      <div className="space-y-6 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10 text-2xl text-emerald-500">
          ✓
        </div>
        <div>
          <h2 className="text-xl font-semibold">{parsedBill.name} added</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {formatAud(parsedBill.amount)} · {parsedBill.frequency}
          </p>
          <p className="mt-2 text-sm text-emerald-500">
            Reserving {formatAud(parsedBill.perPay)} per pay from now on
          </p>
        </div>

        <SurfaceCard className="space-y-3 text-left">
          <p className="text-xs text-muted-foreground">Available Money updated</p>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Was</span>
            <span className="font-mono text-muted-foreground line-through">
              {formatAud(5299)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-emerald-500">Now</span>
            <span className="font-mono text-xl font-semibold text-emerald-500">
              {formatAud(4819)}
            </span>
          </div>
        </SurfaceCard>

        <div className="space-y-3">
          <button
            type="button"
            onClick={reset}
            className="w-full rounded-2xl border border-dashed border-primary/30 bg-primary/10 px-4 py-4 text-sm font-medium text-primary"
          >
            + Add another bill
          </button>
          <Link
            href="/"
            className="block w-full rounded-2xl border border-border px-4 py-4 text-sm text-muted-foreground"
          >
            Done - back to Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {flowState === "input" ? (
        <>
          <p className="text-[15px] leading-7 text-muted-foreground">
            Just describe the bill in your own words. How much, how often, when
            it&apos;s due - whatever you know.
          </p>

          <div className="relative">
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={4}
              placeholder='e.g. "Car insurance $480 quarterly, due June 15"'
              className="w-full rounded-2xl border border-border bg-card px-4 py-4 text-sm outline-none transition-colors focus:border-primary/50"
            />
            {canSubmit ? (
              <button
                type="button"
                onClick={() => submit()}
                className="absolute bottom-3 right-3 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white"
              >
                Go
              </button>
            ) : null}
          </div>

          {errorMessage ? (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
              {errorMessage}
            </div>
          ) : null}

          <div>
            <p className="mb-3 text-xs uppercase tracking-[0.5px] text-muted-foreground">
              Try one of these
            </p>
            <div className="space-y-2">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => submit(suggestion)}
                  className="w-full rounded-xl border border-border bg-card px-4 py-3 text-left text-sm text-muted-foreground"
                >
                  &quot;{suggestion}&quot;
                </button>
              ))}
            </div>
          </div>

          <SurfaceCard>
            <p className="text-sm text-muted-foreground">Prefer a form?</p>
            <Link href="/bills/new/manual" className="mt-2 inline-block text-sm font-medium text-primary">
              Enter details manually instead
            </Link>
          </SurfaceCard>
        </>
      ) : null}

      {flowState === "thinking" ? (
        <>
          <SurfaceCard>
            <p className="text-sm italic text-muted-foreground">&quot;{text}&quot;</p>
          </SurfaceCard>
          <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            </div>
            <div>
              <p className="text-sm font-medium">Understanding your bill...</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Extracting amount, frequency, and due date
              </p>
            </div>
          </div>
        </>
      ) : null}

      {flowState === "confirm" && parsedBill ? (
        <>
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500">
              ✓
            </div>
            <p className="text-sm font-medium">Here&apos;s what I got</p>
          </div>

          <SurfaceCard className="space-y-3">
            <ConfirmationRow label="Name" value={parsedBill.name} />
            <ConfirmationRow label="Amount" value={formatAud(parsedBill.amount)} />
            <ConfirmationRow label="Frequency" value={parsedBill.frequency} />
            <ConfirmationRow
              label="Next due"
              value={parsedBill.nextDueDate ?? "Tap to add"}
              missing={!parsedBill.nextDueDate}
            />
            <ConfirmationRow label="Category" value={parsedBill.category} />
            <ConfirmationRow label="Per pay" value={`${formatAud(parsedBill.perPay)} / pay`} />
          </SurfaceCard>

          {!parsedBill.nextDueDate ? (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm leading-6 text-muted-foreground">
              I need the next due date to calculate your reserves accurately. Add
              it before saving if you know it.
            </div>
          ) : null}

          <div className="rounded-xl border border-primary/20 bg-primary/10 p-4 text-sm leading-6 text-muted-foreground">
            Keel will reserve{" "}
            <span className="font-mono font-semibold text-primary">
              {formatAud(parsedBill.perPay)}
            </span>{" "}
            from each pay so this is covered when it&apos;s due.
          </div>

          <div className="space-y-3">
            <button
              type="button"
              onClick={() => setFlowState("saved")}
              className="w-full rounded-2xl bg-primary px-4 py-4 text-sm font-semibold text-white"
            >
              Add this bill
            </button>
            <button
              type="button"
              onClick={reset}
              className="w-full rounded-2xl border border-border px-4 py-4 text-sm text-muted-foreground"
            >
              Start over
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}

function ConfirmationRow({
  label,
  value,
  missing,
}: {
  label: string;
  value: string;
  missing?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border pb-3 last:border-b-0 last:pb-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={missing ? "text-sm text-amber-500" : "text-sm"}>
        {value}
      </span>
    </div>
  );
}
