/**
 * Shared presentation and formatting utilities (client + server safe).
 *
 * - `cn` merges Tailwind class lists via `clsx` + `tailwind-merge` (conflicts resolve
 *   to the last winning utility, which is what you want 99% of the time in JSX).
 * - `formatAud` is the canonical currency display for the product (en-AU, AUD).
 * - `toIsoDate` truncates a `Date` to `YYYY-MM-DD` in UTC — matches how scheduled
 *   cashflow dates are stored and compared throughout the engine.
 *
 * @module lib/utils
 */

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merges class names; later arguments override conflicting Tailwind utilities. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Module-level — Intl.NumberFormat construction is measurably expensive and this function
// is called on every list render (projection rows, legend rows, goal cards, etc.).
const AUD_FORMATTER = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

/** Formats a number as Australian dollars for UI copy (not for persisted amounts). */
export function formatAud(amount: number) {
  return AUD_FORMATTER.format(amount);
}

export function sentenceCaseFrequency(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

/** UTC calendar date as `YYYY-MM-DD` (engine + persistence convention). */
export function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

const DISPLAY_SHORT = new Intl.DateTimeFormat("en-AU", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

const DISPLAY_LONG = new Intl.DateTimeFormat("en-AU", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

const DISPLAY_SHORT_DAY = new Intl.DateTimeFormat("en-AU", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

/**
 * Human-readable dates for UI copy (`23 Apr`, `Monday 23 April`).
 * Pass ISO `YYYY-MM-DD` calendar dates (UTC midnight).
 */
export function formatDisplayDate(
  isoDate: string,
  format: "short" | "long" | "short-day" = "short",
) {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
    return isoDate || "";
  }
  const d = new Date(`${isoDate}T00:00:00Z`);
  if (format === "long") return DISPLAY_LONG.format(d);
  if (format === "short-day") return DISPLAY_SHORT_DAY.format(d);
  return DISPLAY_SHORT.format(d);
}
