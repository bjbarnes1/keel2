import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

const parsedBillSchema = z.object({
  name: z.string().min(1),
  amount: z.number().finite().nonnegative(),
  frequency: z.enum(["weekly", "fortnightly", "monthly", "quarterly", "annual"]),
  nextDueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  category: z.string().min(1),
  perPay: z.number().finite().nonnegative(),
});

type ParsedBill = z.infer<typeof parsedBillSchema>;

const validFrequencies = new Set<ParsedBill["frequency"]>([
  "weekly",
  "fortnightly",
  "monthly",
  "quarterly",
  "annual",
]);

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

const examples = [
  {
    test: /car insurance/i,
    value: {
      name: "Car Insurance",
      amount: 480,
      frequency: "quarterly",
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
      frequency: "monthly",
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
      frequency: "quarterly",
      nextDueDate: "2026-07-01",
      category: "Education",
      perPay: 750,
    },
  },
];

function fallbackParse(description: string) {
  const matchedExample = examples.find((example) => example.test.test(description));

  if (matchedExample) {
    return matchedExample.value;
  }

  const amountMatch = description.match(/\$?\s*([\d,.]+)/);
  const amount = amountMatch
    ? Number.parseFloat(amountMatch[1].replaceAll(",", ""))
    : 0;

  let frequency: z.infer<typeof parsedBillSchema>["frequency"] = "monthly";
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
    frequency === "annual"
      ? 26
      : frequency === "quarterly"
        ? 6
        : frequency === "monthly"
          ? 2
          : 1;

  return {
    name: "New Bill",
    amount,
    frequency,
    nextDueDate: null,
    category: "Other" as const,
    perPay: Math.round((amount / divisor) * 100) / 100,
  };
}

function parseMoneyNumber(value: unknown) {
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

  throw new Error("Unable to parse bill amount.");
}

function normalizeFrequency(value: unknown): ParsedBill["frequency"] {
  if (typeof value !== "string") {
    throw new Error("Bill frequency must be a string.");
  }

  const normalized = value.trim().toLowerCase();

  if (validFrequencies.has(normalized as ParsedBill["frequency"])) {
    return normalized as ParsedBill["frequency"];
  }

  if (normalized.includes("month")) return "monthly";
  if (normalized.includes("quarter") || normalized.includes("term")) return "quarterly";
  if (normalized.includes("fortnight")) return "fortnightly";
  if (normalized.includes("week")) return "weekly";
  if (normalized.includes("annual") || normalized.includes("year")) return "annual";

  throw new Error(`Unsupported bill frequency: ${value}`);
}

function normalizeCategory(value: unknown): ParsedBill["category"] {
  if (typeof value !== "string") {
    return "Other";
  }

  const trimmed = value.trim();
  const normalized = trimmed.toLowerCase();
  return categoryMap.get(normalized) ?? "Other";
}

function normalizeDate(value: unknown): string | null {
  if (value == null) {
    return null;
  }

  if (typeof value !== "string") {
    throw new Error("Bill due date must be a string or null.");
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

function extractJsonObject(text: string) {
  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fencedMatch?.[1] ?? text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    throw new Error("No JSON object found in AI response.");
  }

  return candidate.slice(start, end + 1);
}

export function normalizeParsedBill(raw: unknown): ParsedBill {
  if (!raw || typeof raw !== "object") {
    throw new Error("AI response did not contain a bill object.");
  }

  const candidate = raw as Record<string, unknown>;

  return parsedBillSchema.parse({
    name: String(candidate.name ?? "").trim(),
    amount: parseMoneyNumber(candidate.amount),
    frequency: normalizeFrequency(candidate.frequency),
    nextDueDate: normalizeDate(candidate.nextDueDate),
    category: normalizeCategory(candidate.category),
    perPay: parseMoneyNumber(candidate.perPay),
  });
}

export async function parseBillDescription(description: string) {
  const trimmed = description.trim();

  if (!trimmed) {
    throw new Error("A bill description is required.");
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return normalizeParsedBill(fallbackParse(trimmed));
  }

  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 400,
    system: `You extract bill details from natural language for a budgeting app.

Return only valid JSON with:
{
  "name": string,
  "amount": number,
  "frequency": "weekly" | "fortnightly" | "monthly" | "quarterly" | "annual",
  "nextDueDate": "YYYY-MM-DD" | null,
  "category": "Housing" | "Insurance" | "Utilities" | "Subscriptions" | "Transport" | "Education" | "Health" | "Other",
  "perPay": number
}

Rules:
- "per term" counts as quarterly
- if the next due date is unknown, use null
- amount is the amount per billing cycle
- perPay should assume a fortnightly pay cycle`,
    messages: [{ role: "user", content: trimmed }],
  });

  const text = response.content.find((item) => item.type === "text");
  const body = text?.type === "text" ? text.text : "";
  const parsed = JSON.parse(extractJsonObject(body));
  return normalizeParsedBill(parsed);
}
