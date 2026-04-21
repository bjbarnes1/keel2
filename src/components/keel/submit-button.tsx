"use client";

/**
 * Form submit control wired to `react-dom` `useFormStatus` pending state.
 *
 * @module components/keel/submit-button
 */

import { Loader2 } from "lucide-react";
import { useFormStatus } from "react-dom";

import { cn } from "@/lib/utils";

export function SubmitButton({
  label,
  pendingLabel,
  className,
  disabled,
  variant = "solid",
}: {
  label: string;
  pendingLabel?: string;
  className?: string;
  disabled?: boolean;
  variant?: "solid" | "outline" | "soft";
}) {
  const { pending } = useFormStatus();
  const text = pending ? (pendingLabel ?? "Saving…") : label;

  const base =
    "inline-flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-4 text-center text-sm font-semibold transition-opacity disabled:cursor-not-allowed disabled:opacity-50";

  const theme =
    variant === "solid"
      ? "bg-primary text-white"
      : variant === "outline"
        ? "border border-border text-muted-foreground hover:text-foreground"
        : "border border-primary/40 bg-primary/10 text-primary";

  return (
    <button
      type="submit"
      disabled={Boolean(disabled) || pending}
      className={cn(base, theme, className)}
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {text}
    </button>
  );
}

