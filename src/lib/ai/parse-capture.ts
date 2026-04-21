/**
 * Natural-language → structured finance objects for Capture + Ask flows.
 *
 * Responsibilities:
 * - Define Zod schemas for commitments, incomes, and wealth assets (`*CaptureSchema`).
 * - Call Anthropic with narrowly scoped system prompts; require JSON-only responses.
 * - Normalize messy model output (`extractJsonObject`, repair passes) before validation.
 * - Compute `perPay` using engine helpers so UI and engine agree on cadence math.
 *
 * **Security:** this module never receives raw credentials; only user-typed descriptions.
 * Rate limiting is enforced in route handlers via `assertWithinAiRateLimit`.
 *
 * @module lib/ai/parse-capture
 */

import { z } from "zod";

import { getAnthropicClient } from "@/lib/ai/client";
import { calculatePerPayAmount } from "@/lib/engine/keel";

// --- Zod wire schemas (validated shapes for Server Actions / forms) ------------

/**
 * Parsed bill / recurring commitment from Capture or Ask flows.
 *
 * - `amount`: currency per **billing cycle** (not annualized).
 * - `perPay`: money to set aside each primary pay period (fortnightly assumption when auto).
 * - `perPayAuto`: when true, `perPay` was derived; when false, user/model fixed it explicitly.
 */
export const commitmentCaptureSchema = z.object({
  name: z.string().min(1),
  amount: z.number().finite().nonnegative(),
  frequency: z.enum(["weekly", "fortnightly", "monthly", "quarterly", "annual"]),
  nextDueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  category: z.string().min(1),
  perPay: z.number().finite().nonnegative(),
  perPayAuto: z.boolean(),
});

export type CommitmentCapturePayload = z.infer<typeof commitmentCaptureSchema>;

/** Pay-cycle income: amount per pay; `nextPayDate` nullable when unknown. */
export const incomeCaptureSchema = z.object({
  name: z.string().min(1),
  amount: z.number().finite().nonnegative(),
  frequency: z.enum(["weekly", "fortnightly", "monthly"]),
  nextPayDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  isPrimary: z.boolean().optional(),
});

export type IncomeCapturePayload = z.infer<typeof incomeCaptureSchema>;

/**
 * Manual wealth holding row. Either `unitPrice × quantity` or `valueOverride` conveys total value.
 * `asOf` optional valuation date for snapshots.
 */
export const assetCaptureSchema = z.object({
  name: z.string().min(1),
  assetType: z.string().min(1),
  symbol: z.string().min(1).nullable().optional(),
  quantity: z.number().finite().nonnegative(),
  unitPrice: z.number().finite().nonnegative().nullable().optional(),
  valueOverride: z.number().finite().nonnegative().nullable().optional(),
  asOf: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
});

export type AssetCapturePayload = z.infer<typeof assetCaptureSchema>;

/** Allowed commitment cadence literals after normalization. */
const validCommitmentFrequencies = new Set<CommitmentCapturePayload["frequency"]>([
  "weekly",
  "fortnightly",
  "monthly",
  "quarterly",
  "annual",
]);

const validIncomeFrequencies = new Set<IncomeCapturePayload["frequency"]>(["weekly", "fortnightly", "monthly"]);

/** Maps free-form / lowercase category hints to canonical dashboard category labels. */
const categoryMap = new Map<string, string>([
  ["housing", "Housing"],
  ["insurance", "Insurance"],
  ["utilities", "Utilities"],
  ["subscriptions", "Subscriptions"],
  ["transport", "Transport"],
  ["education", "Education"],
  ["health", "Health"],
  ["medical", "Health"],
  ["other", "Other"],
]);

/**
 * Deterministic regex fixtures when `ANTHROPIC_API_KEY` is unset — keeps demos/tests stable.
 * Not a general parser; `fallbackCommitmentParse` uses this before naive dollar extraction.
 */
const billExamples = [
  {
    test: /car insurance/i,
    value: {
      name: "Car Insurance",
      amount: 480,
      frequency: "quarterly" as const,
      nextDueDate: "2026-06-15",
      category: "Insurance",
      perPay: 80,
    },
  },
  {
    test: /netflix/i,
    value: {
      name: "Netflix",
      amount: 22.99,
      frequency: "monthly" as const,
      nextDueDate: "2026-04-19",
      category: "Subscriptions",
      perPay: 11.5,
    },
  },
  {
    test: /school fees/i,
    value: {
      name: "School Fees",
      amount: 4500,
      frequency: "quarterly" as const,
      nextDueDate: "2026-07-01",
      category: "Education",
      perPay: 750,
    },
  },
];

// --- Response repair (model output → JSON.parse) --------------------------------

/**
 * Pulls the first `{ ... }` block from model text, stripping ```json fences if present.
 * @throws If no object-shaped JSON substring exists (model echoed prose or invalid).
 */
export function extractJsonObject(text: string) {
  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fencedMatch?.[1] ?? text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    throw new Error("No JSON object found in AI response.");
  }

  return candidate.slice(start, end + 1);
}

/**
 * Coerces model output to a finite number: accepts number or strings like `"$1,234.50"`.
 * @throws If the value cannot be interpreted as money.
 */
export function parseMoneyNumber(value: unknown) {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.replace(/[$,\s]/g, "");
    const parsed = Number.parseFloat(normalized);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  throw new Error("Unable to parse money amount.");
}

/**
 * Maps English frequency phrases to engine enums (`"per term"` → quarterly).
 * @throws On unrecognized input (forces explicit repair upstream).
 */
export function normalizeFrequency(value: unknown): CommitmentCapturePayload["frequency"] {
  if (typeof value !== "string") {
    throw new Error("Frequency must be a string.");
  }

  const normalized = value.trim().toLowerCase();

  if (validCommitmentFrequencies.has(normalized as CommitmentCapturePayload["frequency"])) {
    return normalized as CommitmentCapturePayload["frequency"];
  }

  if (normalized.includes("month")) return "monthly";
  if (normalized.includes("quarter") || normalized.includes("term")) return "quarterly";
  if (normalized.includes("fortnight")) return "fortnightly";
  if (normalized.includes("week")) return "weekly";
  if (normalized.includes("annual") || normalized.includes("year")) return "annual";

  throw new Error(`Unsupported frequency: ${value}`);
}

/**
 * Income cadence normalizer; **defaults to `fortnightly`** when ambiguous (Australian primary case).
 */
export function normalizeIncomeFrequency(value: unknown): IncomeCapturePayload["frequency"] {
  if (typeof value !== "string") {
    throw new Error("Income frequency must be a string.");
  }

  const normalized = value.trim().toLowerCase();
  if (validIncomeFrequencies.has(normalized as IncomeCapturePayload["frequency"])) {
    return normalized as IncomeCapturePayload["frequency"];
  }

  if (normalized.includes("month")) return "monthly";
  if (normalized.includes("fortnight")) return "fortnightly";
  if (normalized.includes("week")) return "weekly";

  return "fortnightly";
}

/** Collapses unknown categories to `"Other"` — never throws. */
export function normalizeCategory(value: unknown): CommitmentCapturePayload["category"] {
  if (typeof value !== "string") {
    return "Other";
  }

  const trimmed = value.trim();
  const normalized = trimmed.toLowerCase();
  return categoryMap.get(normalized) ?? "Other";
}

/**
 * Produces `YYYY-MM-DD` or `null`. Accepts ISO dates or parseable date strings.
 * Invalid dates return `null` (soft) except empty string after trim → `null`.
 * @throws If value is non-null and not a string (strict object hygiene from Zod repair).
 */
export function normalizeDate(value: unknown): string | null {
  if (value == null) {
    return null;
  }

  if (typeof value !== "string") {
    throw new Error("Date must be a string or null.");
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return [
    parsed.getFullYear(),
    String(parsed.getMonth() + 1).padStart(2, "0"),
    String(parsed.getDate()).padStart(2, "0"),
  ].join("-");
}

// --- No-LLM fallbacks (missing API key or offline) ------------------------------

/** Heuristic commitment parse: known examples, then dollar + keyword guessing. */
function fallbackCommitmentParse(description: string) {
  const matchedExample = billExamples.find((example) => example.test.test(description));

  if (matchedExample) {
    return { ...matchedExample.value, perPayAuto: true as const };
  }

  const amountMatch = description.match(/\$?\s*([\d,.]+)/);
  const amount = amountMatch ? Number.parseFloat(amountMatch[1].replaceAll(",", "")) : 0;

  let frequency: CommitmentCapturePayload["frequency"] = "monthly";
  if (/quarter|term/i.test(description)) {
    frequency = "quarterly";
  } else if (/annual|year/i.test(description)) {
    frequency = "annual";
  } else if (/fortnight/i.test(description)) {
    frequency = "fortnightly";
  } else if (/week/i.test(description)) {
    frequency = "weekly";
  }

  const divisor =
    frequency === "annual" ? 26 : frequency === "quarterly" ? 6 : frequency === "monthly" ? 2 : 1;

  const perPay = Math.round((amount / divisor) * 100) / 100;

  return {
    name: "New Bill",
    amount,
    frequency,
    nextDueDate: null,
    category: "Other" as const,
    perPay,
    perPayAuto: true as const,
  };
}

/**
 * Strict object → `CommitmentCapturePayload` via Zod. Fills `perPay` with engine math when omitted.
 * @throws ZodError or parse errors from nested normalizers.
 */
export function normalizeCommitmentCapture(raw: unknown): CommitmentCapturePayload {
  if (!raw || typeof raw !== "object") {
    throw new Error("AI response did not contain an object.");
  }

  const candidate = raw as Record<string, unknown>;

  const frequency = normalizeFrequency(candidate.frequency);
  const amount = parseMoneyNumber(candidate.amount);
  const perPayRaw = candidate.perPay;
  const perPayAuto = Boolean(candidate.perPayAuto);

  const perPay =
    perPayRaw == null ? calculatePerPayAmount(amount, frequency, "fortnightly") : parseMoneyNumber(perPayRaw);

  return commitmentCaptureSchema.parse({
    name: String(candidate.name ?? "").trim(),
    amount,
    frequency,
    nextDueDate: normalizeDate(candidate.nextDueDate),
    category: normalizeCategory(candidate.category),
    perPay,
    perPayAuto,
  });
}

/**
 * LLM extraction for a bill sentence (Sonnet). Falls back to `fallbackCommitmentParse` without API key.
 *
 * Side effects: network call to Anthropic when configured.
 * @throws Empty input, JSON repair failures, or validation errors from `normalizeCommitmentCapture`.
 */
export async function parseCommitmentCapture(sentence: string) {
  const trimmed = sentence.trim();

  if (!trimmed) {
    throw new Error("A description is required.");
  }

  const client = getAnthropicClient();
  if (!client) {
    return normalizeCommitmentCapture(fallbackCommitmentParse(trimmed));
  }

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 450,
    system: `You extract bill/commitment details from natural language for a budgeting app.

Return only valid JSON with:
{
  "name": string,
  "amount": number,
  "frequency": "weekly" | "fortnightly" | "monthly" | "quarterly" | "annual",
  "nextDueDate": "YYYY-MM-DD" | null,
  "category": "Housing" | "Insurance" | "Utilities" | "Subscriptions" | "Transport" | "Education" | "Health" | "Other",
  "perPay": number,
  "perPayAuto": boolean
}

Rules:
- "per term" counts as quarterly
- if the next due date is unknown, use null
- amount is the amount per billing cycle
- If you can confidently derive per-pay from a fortnightly pay assumption, set perPayAuto=true and set perPay accordingly.
- If the user explicitly states a per-pay reserve, set perPayAuto=false and match their perPay exactly.`,
    messages: [{ role: "user", content: trimmed }],
  });

  const text = response.content.find((item) => item.type === "text");
  const body = text?.type === "text" ? text.text : "";
  const parsed = JSON.parse(extractJsonObject(body));
  return normalizeCommitmentCapture(parsed);
}

// ---------------------------------------------------------------------------
// Income capture (LLM + fallback)
// ---------------------------------------------------------------------------

/**
 * Heuristic income parse when Anthropic is unavailable (dev/demo).
 * Pulls the first money token for amount and infers weekly/monthly/fortnightly from keywords.
 */
function fallbackIncomeParse(description: string) {
  const amountMatch = description.match(/\$?\s*([\d,.]+)/);
  const amount = amountMatch ? Number.parseFloat(amountMatch[1].replaceAll(",", "")) : 0;

  let frequency: IncomeCapturePayload["frequency"] = "fortnightly";
  if (/month/i.test(description)) frequency = "monthly";
  if (/week/i.test(description)) frequency = "weekly";

  return {
    name: "Income",
    amount,
    frequency,
    nextPayDate: null,
    isPrimary: false,
  };
}

/**
 * Validates and coerces arbitrary JSON into {@link IncomeCapturePayload}.
 * @throws When `raw` is not an object or Zod rejects a field.
 */
export function normalizeIncomeCapture(raw: unknown): IncomeCapturePayload {
  if (!raw || typeof raw !== "object") {
    throw new Error("AI response did not contain an object.");
  }

  const candidate = raw as Record<string, unknown>;

  return incomeCaptureSchema.parse({
    name: String(candidate.name ?? "").trim(),
    amount: parseMoneyNumber(candidate.amount),
    frequency: normalizeIncomeFrequency(candidate.frequency),
    nextPayDate: normalizeDate(candidate.nextPayDate),
    isPrimary: typeof candidate.isPrimary === "boolean" ? candidate.isPrimary : undefined,
  });
}

/**
 * Parses a natural-language income description via Claude, or {@link fallbackIncomeParse} if no client.
 * @param sentence User text; must be non-empty after trim.
 */
export async function parseIncomeCapture(sentence: string) {
  const trimmed = sentence.trim();
  if (!trimmed) {
    throw new Error("A description is required.");
  }

  const client = getAnthropicClient();
  if (!client) {
    return normalizeIncomeCapture(fallbackIncomeParse(trimmed));
  }

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 400,
    system: `You extract income details from natural language for a budgeting app.

Return only valid JSON with:
{
  "name": string,
  "amount": number,
  "frequency": "weekly" | "fortnightly" | "monthly",
  "nextPayDate": "YYYY-MM-DD" | null,
  "isPrimary": boolean
}

Rules:
- amount is the amount per pay cycle
- if next pay date is unknown, use null`,
    messages: [{ role: "user", content: trimmed }],
  });

  const text = response.content.find((item) => item.type === "text");
  const body = text?.type === "text" ? text.text : "";
  const parsed = JSON.parse(extractJsonObject(body));
  return normalizeIncomeCapture(parsed);
}

// ---------------------------------------------------------------------------
// Asset / investment capture (LLM + fallback)
// ---------------------------------------------------------------------------

/**
 * Heuristic asset parse when Anthropic is unavailable.
 * If a 3–5 letter token looks like a ticker, treats value as holding size; otherwise value is unit price with quantity 1.
 */
function fallbackAssetParse(description: string) {
  const amountMatch = description.match(/\$?\s*([\d,.]+)/);
  const value = amountMatch ? Number.parseFloat(amountMatch[1].replaceAll(",", "")) : 0;

  const symbolMatch = description.match(/\b([A-Z]{3,5})\b/);
  const symbol = symbolMatch?.[1] ?? null;

  return {
    name: symbol ? `${symbol} holding` : "Investment",
    assetType: "ETF",
    symbol,
    quantity: symbol ? 1 : 1,
    unitPrice: symbol ? null : value,
    valueOverride: symbol ? value : null,
    asOf: null,
  };
}

/**
 * Validates and coerces arbitrary JSON into {@link AssetCapturePayload}.
 * @throws When `raw` is not an object or Zod rejects a field.
 */
export function normalizeAssetCapture(raw: unknown): AssetCapturePayload {
  if (!raw || typeof raw !== "object") {
    throw new Error("AI response did not contain an object.");
  }

  const candidate = raw as Record<string, unknown>;

  return assetCaptureSchema.parse({
    name: String(candidate.name ?? "").trim(),
    assetType: String(candidate.assetType ?? "OTHER").trim(),
    symbol: candidate.symbol == null ? null : String(candidate.symbol),
    quantity: parseMoneyNumber(candidate.quantity),
    unitPrice: candidate.unitPrice == null ? null : parseMoneyNumber(candidate.unitPrice),
    valueOverride: candidate.valueOverride == null ? null : parseMoneyNumber(candidate.valueOverride),
    asOf: candidate.asOf == null ? null : normalizeDate(candidate.asOf),
  });
}

/**
 * Parses a natural-language held-asset description via Claude, or {@link fallbackAssetParse} if no client.
 * @param sentence User text; must be non-empty after trim.
 */
export async function parseAssetCapture(sentence: string) {
  const trimmed = sentence.trim();
  if (!trimmed) {
    throw new Error("A description is required.");
  }

  const client = getAnthropicClient();
  if (!client) {
    return normalizeAssetCapture(fallbackAssetParse(trimmed));
  }

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 450,
    system: `You extract held-asset details from natural language for a wealth tracker.

Return only valid JSON with:
{
  "name": string,
  "assetType": string,
  "symbol": string | null,
  "quantity": number,
  "unitPrice": number | null,
  "valueOverride": number | null,
  "asOf": "YYYY-MM-DD" | null
}

Rules:
- Prefer explicit quantities and tickers when present
- If the user states a total portfolio/market value without quantity, use quantity=1 and valueOverride`,
    messages: [{ role: "user", content: trimmed }],
  });

  const text = response.content.find((item) => item.type === "text");
  const body = text?.type === "text" ? text.text : "";
  const parsed = JSON.parse(extractJsonObject(body));
  return normalizeAssetCapture(parsed);
}
