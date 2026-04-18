import { normalizeCommitmentCapture, parseCommitmentCapture } from "@/lib/ai/parse-capture";

export type ParsedBill = {
  name: string;
  amount: number;
  frequency: "weekly" | "fortnightly" | "monthly" | "quarterly" | "annual";
  nextDueDate: string | null;
  category: string;
  perPay: number;
};

export function normalizeParsedBill(raw: unknown): ParsedBill {
  const parsed = normalizeCommitmentCapture(raw);
  return {
    name: parsed.name,
    amount: parsed.amount,
    frequency: parsed.frequency,
    nextDueDate: parsed.nextDueDate,
    category: parsed.category,
    perPay: parsed.perPay,
  };
}

export async function parseBillDescription(description: string) {
  const parsed = await parseCommitmentCapture(description);
  return {
    name: parsed.name,
    amount: parsed.amount,
    frequency: parsed.frequency,
    nextDueDate: parsed.nextDueDate,
    category: parsed.category,
    perPay: parsed.perPay,
  };
}
