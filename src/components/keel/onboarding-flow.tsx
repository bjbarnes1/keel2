"use client";

/**
 * Multi-step onboarding wizard for first-run users (client-only state machine).
 *
 * @module components/keel/onboarding-flow
 */

import Link from "next/link";
import { useMemo, useState } from "react";

import { formatAud } from "@/lib/utils";

const steps = [
  "Welcome",
  "Pay frequency",
  "Pay amount",
  "Next payday",
  "Bank balance",
  "Add commitments",
  "Reveal",
];

const payFrequencies = [
  { value: "Weekly", hint: "52 times a year" },
  { value: "Fortnightly", hint: "26 times a year" },
  { value: "Monthly", hint: "12 times a year" },
];

const sampleBills = [
  "Mortgage · $2,400 / month",
  "Internet · $89 / month",
  "Car Insurance · $480 / quarter",
];

export function OnboardingFlow() {
  const [step, setStep] = useState(0);
  const [selectedFrequency, setSelectedFrequency] = useState("Fortnightly");
  const [payAmount, setPayAmount] = useState("4200");
  const [nextPayday, setNextPayday] = useState("2026-04-24");
  const [bankBalance, setBankBalance] = useState("8696");
  const [billText, setBillText] = useState("");
  const [addedBills, setAddedBills] = useState<string[]>(sampleBills);

  const progress = `${((step + 1) / steps.length) * 100}%`;
  const availableMoney = useMemo(() => 4299, []);

  function addBill() {
    if (!billText.trim()) {
      return;
    }

    setAddedBills((current) => [...current, billText.trim()]);
    setBillText("");
  }

  return (
    <div className="space-y-6">
      <div className="h-1 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-primary" style={{ width: progress }} />
      </div>

      {step === 0 ? (
        <section className="space-y-6 py-8 text-center">
          <div>
            <h2 className="text-3xl font-bold tracking-[-1px]">Keel</h2>
            <p className="mt-3 text-base text-muted-foreground">
              See what you actually have.
            </p>
          </div>
          <p className="text-sm text-muted-foreground">
            Let&apos;s set up your finances. This takes about 3 minutes.
          </p>
          <button
            type="button"
            onClick={() => setStep(1)}
            className="w-full rounded-2xl bg-primary px-4 py-4 text-sm font-semibold text-white"
          >
            Get started
          </button>
        </section>
      ) : null}

      {step === 1 ? (
        <StepFrame
          title="How often do you get paid?"
          nextLabel="Next"
          onNext={() => setStep(2)}
        >
          <div className="space-y-3">
            {payFrequencies.map((item) => {
              const active = item.value === selectedFrequency;
              return (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setSelectedFrequency(item.value)}
                  className={`w-full rounded-2xl border px-4 py-4 text-left ${
                    active
                      ? "border-primary/50 bg-primary/10"
                      : "border-border bg-card"
                  }`}
                >
                  <p className="text-base font-medium">{item.value}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{item.hint}</p>
                </button>
              );
            })}
          </div>
        </StepFrame>
      ) : null}

      {step === 2 ? (
        <StepFrame
          title="How much do you take home each pay?"
          description="After tax - what actually hits your account."
          nextLabel="Next"
          onNext={() => setStep(3)}
        >
          <input
            value={payAmount}
            onChange={(event) => setPayAmount(event.target.value)}
            className="w-full rounded-2xl border border-border bg-card px-4 py-4 text-center font-mono text-4xl outline-none"
          />
        </StepFrame>
      ) : null}

      {step === 3 ? (
        <StepFrame
          title="When's your next payday?"
          nextLabel="Next"
          onNext={() => setStep(4)}
        >
          <input
            type="date"
            value={nextPayday}
            onChange={(event) => setNextPayday(event.target.value)}
            className="w-full rounded-2xl border border-border bg-card px-4 py-4 outline-none"
          />
        </StepFrame>
      ) : null}

      {step === 4 ? (
        <StepFrame
          title="What's your bank balance right now?"
          description="Your main account - the one your pay goes into."
          nextLabel="Next"
          onNext={() => setStep(5)}
        >
          <input
            value={bankBalance}
            onChange={(event) => setBankBalance(event.target.value)}
            className="w-full rounded-2xl border border-border bg-card px-4 py-4 text-center font-mono text-4xl outline-none"
          />
        </StepFrame>
      ) : null}

      {step === 5 ? (
        <StepFrame
          title="Now let's add your commitments"
          description="Tell Keel about your regular expenses. The more you add, the more accurate your Available Money will be."
          nextLabel="Done - see my Available Money"
          onNext={() => setStep(6)}
        >
          <div className="space-y-4">
            <textarea
              value={billText}
              onChange={(event) => setBillText(event.target.value)}
              rows={3}
              placeholder='e.g. "Mortgage $2400 monthly due first of the month"'
              className="w-full rounded-2xl border border-border bg-card px-4 py-4 text-sm outline-none"
            />
            <button
              type="button"
              onClick={addBill}
              className="w-full rounded-2xl border border-dashed border-primary/30 bg-primary/10 px-4 py-3 text-sm font-medium text-primary"
            >
              + Add another
            </button>
            <div className="space-y-2">
              {addedBills.map((bill) => (
                <div
                  key={bill}
                  className="rounded-2xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground"
                >
                  {bill}
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">{addedBills.length} commitments added</p>
          </div>
        </StepFrame>
      ) : null}

      {step === 6 ? (
        <section className="space-y-6 py-6 text-center">
          <p className="text-xs uppercase tracking-[0.5px] text-muted-foreground">
            Here&apos;s your Available Money
          </p>
          <p className="font-mono text-6xl font-bold text-emerald-500 tracking-[-1px]">
            {formatAud(availableMoney)}
          </p>
          <div className="mx-auto max-w-sm rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-5 text-left">
            <div className="space-y-2 text-sm">
              <RevealRow label="Bank balance" value={formatAud(Number(bankBalance))} />
              <RevealRow label="Reserved for commitments" value={formatAud(3997)} negative />
              <RevealRow label="Goal contributions" value={formatAud(400)} negative />
              <div className="my-2 h-px bg-white/10" />
              <RevealRow label="Yours to spend" value={formatAud(availableMoney)} highlight />
            </div>
          </div>
          <p className="text-sm leading-6 text-muted-foreground">
            This is what you actually have after everything you owe is accounted
            for.
          </p>
          <div className="space-y-3">
            <Link
              href="/"
              className="block w-full rounded-2xl bg-primary px-4 py-4 text-sm font-semibold text-white"
            >
              Go to Dashboard
            </Link>
            <p className="text-xs text-muted-foreground">
              You can always add more commitments and goals later.
            </p>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function StepFrame({
  title,
  description,
  nextLabel,
  onNext,
  children,
}: {
  title: string;
  description?: string;
  nextLabel: string;
  onNext: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-6 py-4">
      <div>
        <h2 className="text-2xl font-semibold">{title}</h2>
        {description ? (
          <p className="mt-3 text-sm leading-6 text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {children}
      <button
        type="button"
        onClick={onNext}
        className="w-full rounded-2xl bg-primary px-4 py-4 text-sm font-semibold text-white"
      >
        {nextLabel}
      </button>
    </section>
  );
}

function RevealRow({
  label,
  value,
  highlight,
  negative,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  negative?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className={highlight ? "text-sm font-semibold text-emerald-500" : "text-sm text-muted-foreground"}>
        {label}
      </span>
      <span className={highlight ? "font-mono text-sm font-semibold text-emerald-500" : "font-mono text-sm"}>
        {highlight ? value : `${negative ? "-" : ""}${value}`}
      </span>
    </div>
  );
}
