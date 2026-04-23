/**
 * Anti-hallucination gate. Validates that every citation in a Claude response points at
 * a real path in the composed context, and that the claimed value approximately matches
 * the actual value at that path.
 *
 * **Tolerance:** currency values are allowed a 1% relative tolerance (plus a $0.50
 * absolute floor) to accommodate rounding in prose — e.g., Claude saying "about $3,000"
 * for an actual $3,042 is accepted. Non-numeric values must match exactly.
 *
 * **Policy on failure:** the Ask Keel route swaps a failing response for a calm
 * fallback ("I'm having trouble answering that accurately. Could you rephrase, or check
 * your Timeline?") and logs the full context of the failure for review.
 *
 * The validator is pure — pass in a response + context, get back a typed verdict. It
 * does not read from the database or the AI client.
 *
 * @module lib/ai/context/validate-citations
 */

import type { ComposedContext } from "./schemas/composed-context";

/** A single claim linking a natural-language fact to a path within the composed context. */
export type Citation = {
  /** Short restatement of the fact — for logging when a citation fails. */
  fact: string;
  /** Dotted path, e.g. `userContext.commitments[0].amount`. Array indices allowed. */
  path: string;
  /** The value Claude claims lives at that path. Compared with approximate match. */
  value?: string | number | boolean;
};

export type ValidationResult =
  | { valid: true }
  | { valid: false; errors: string[] };

export type ValidationContext = ComposedContext;

/** Relative tolerance used for currency matching. 1% is generous enough for prose rounding. */
export const CURRENCY_RELATIVE_TOLERANCE = 0.01;
/** Absolute tolerance floor for currency matching (dollars). */
export const CURRENCY_ABSOLUTE_TOLERANCE = 0.5;

// --- Path resolution ---------------------------------------------------------

/**
 * Splits a dotted path with array indices into a list of property steps.
 *
 * Accepted:
 *   "userContext.commitments"
 *   "userContext.commitments[0].name"
 *   "userContext.availableMoney.now"
 *
 * Rejected paths return `null`, not an empty array — prevents "" from silently matching
 * the root object. Other rejection reasons:
 *   - leading dot                        ".userContext"
 *   - double dot                         "userContext..now"
 *   - unbalanced brackets                "commitments[0"
 *   - non-numeric index                  "commitments[a]"
 *   - trailing separator                 "userContext."
 */
export function parseCitationPath(path: string): Array<string | number> | null {
  if (typeof path !== "string" || path.length === 0) return null;

  const steps: Array<string | number> = [];
  let i = 0;
  let justConsumed: "key" | "index" | "none" = "none";

  while (i < path.length) {
    const ch = path[i];
    if (ch === ".") {
      // A dot must connect two tokens — never leading, never doubled, never trailing.
      if (justConsumed === "none") return null;
      if (i === path.length - 1) return null;
      justConsumed = "none";
      i += 1;
      continue;
    }
    if (ch === "[") {
      const close = path.indexOf("]", i);
      if (close === -1) return null;
      const indexStr = path.slice(i + 1, close);
      if (indexStr.length === 0 || !/^\d+$/.test(indexStr)) return null;
      steps.push(Number(indexStr));
      justConsumed = "index";
      i = close + 1;
      continue;
    }
    // Consume a key up to the next separator.
    let end = i;
    while (end < path.length && path[end] !== "." && path[end] !== "[") end += 1;
    const key = path.slice(i, end);
    if (key.length === 0) return null;
    steps.push(key);
    justConsumed = "key";
    i = end;
  }

  if (steps.length === 0) return null;
  return steps;
}

/** Walks `root` along `steps`, returning `undefined` on any broken link. */
export function resolveByPath(root: unknown, steps: Array<string | number>): unknown {
  let cur: unknown = root;
  for (const step of steps) {
    if (cur === null || cur === undefined) return undefined;
    if (typeof step === "number") {
      if (!Array.isArray(cur)) return undefined;
      cur = cur[step];
    } else {
      if (typeof cur !== "object") return undefined;
      cur = (cur as Record<string, unknown>)[step];
    }
  }
  return cur;
}

// --- Value comparison --------------------------------------------------------

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/** Currency-tolerant equality — 1% relative, $0.50 absolute floor. */
export function approximatelyEqualCurrency(claimed: number, actual: number): boolean {
  const absDiff = Math.abs(claimed - actual);
  if (absDiff <= CURRENCY_ABSOLUTE_TOLERANCE) return true;
  const scale = Math.max(Math.abs(claimed), Math.abs(actual));
  if (scale === 0) return absDiff === 0;
  return absDiff / scale <= CURRENCY_RELATIVE_TOLERANCE;
}

function citationValueMatches(claimed: Citation["value"], actual: unknown): boolean {
  if (claimed === undefined) return true; // Path-only citations: the value is implied by retrieval.
  if (typeof claimed === "number") {
    if (!isFiniteNumber(actual)) return false;
    return approximatelyEqualCurrency(claimed, actual);
  }
  if (typeof claimed === "boolean") {
    return actual === claimed;
  }
  if (typeof claimed === "string") {
    if (typeof actual === "string") return actual === claimed;
    // Claude sometimes cites a numeric value as a formatted string.
    if (isFiniteNumber(actual)) {
      const coerced = Number(claimed.replace(/[^\d.-]/g, ""));
      if (Number.isFinite(coerced)) return approximatelyEqualCurrency(coerced, actual);
    }
    return false;
  }
  return false;
}

// --- Public API --------------------------------------------------------------

/**
 * Validates a list of citations against the composed context. `errors` is an array of
 * human-readable strings suitable for logging. The first-failing entry is usually enough
 * to diagnose a prompt regression.
 */
export function validateCitations(
  citations: readonly Citation[] | undefined,
  context: ValidationContext,
): ValidationResult {
  if (!citations || citations.length === 0) return { valid: true };

  const errors: string[] = [];

  for (const citation of citations) {
    const steps = parseCitationPath(citation.path);
    if (!steps) {
      errors.push(`Citation "${citation.fact}" has malformed path: "${citation.path}"`);
      continue;
    }
    const actual = resolveByPath(context, steps);
    if (actual === undefined) {
      errors.push(
        `Citation "${citation.fact}" path "${citation.path}" does not exist in the composed context`,
      );
      continue;
    }
    if (!citationValueMatches(citation.value, actual)) {
      errors.push(
        `Citation "${citation.fact}" at "${citation.path}" — claimed ${JSON.stringify(
          citation.value,
        )}, actual ${JSON.stringify(actual)}`,
      );
    }
  }

  if (errors.length > 0) return { valid: false, errors };
  return { valid: true };
}
