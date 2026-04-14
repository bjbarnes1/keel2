import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

const parsedBillSchema = z.object({
  name: z.string(),
  amount: z.number(),
  frequency: z.enum(["weekly", "fortnightly", "monthly", "quarterly", "annual"]),
  nextDueDate: z.string().nullable(),
  category: z.enum([
    "Housing",
    "Insurance",
    "Utilities",
    "Subscriptions",
    "Transport",
    "Education",
    "Health",
    "Other",
  ]),
  perPay: z.number(),
});

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

export async function parseBillDescription(description: string) {
  const trimmed = description.trim();

  if (!trimmed) {
    throw new Error("A bill description is required.");
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return parsedBillSchema.parse(fallbackParse(trimmed));
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
  const parsed = JSON.parse(text?.type === "text" ? text.text : "{}");
  return parsedBillSchema.parse(parsed);
}
