import { z } from "zod";

import { getAnthropicClient } from "@/lib/ai/client";
import { extractJsonObject } from "@/lib/ai/parse-capture";

const classificationSchema = z.object({
  kind: z.enum(["commitment", "income", "asset", "unknown"]),
});

export type CaptureKind = z.infer<typeof classificationSchema>["kind"];

export async function classifyCaptureSentence(sentence: string): Promise<CaptureKind> {
  const trimmed = sentence.trim();
  if (!trimmed) {
    return "unknown";
  }

  const client = getAnthropicClient();
  if (!client) {
    // Without a key, keep the surface deterministic and conservative.
    return "unknown";
  }

  const response = await client.messages.create({
    model: "claude-3-5-haiku-20241022",
    max_tokens: 120,
    system: `You classify a single user sentence for a personal finance app.

Return only valid JSON:
{ "kind": "commitment" | "income" | "asset" | "unknown" }

Rules:
- financial-only: recurring bills/subscriptions, income/pay, or held assets (shares/ETF/crypto/property value)
- If it is a to-do, shopping list, reminder, travel plan, medical appointment, or anything not money-flow/asset, return unknown
- If ambiguous, return unknown`,
    messages: [{ role: "user", content: trimmed }],
  });

  const text = response.content.find((item) => item.type === "text");
  const body = text?.type === "text" ? text.text : "";
  const parsed = JSON.parse(extractJsonObject(body));
  return classificationSchema.parse(parsed).kind;
}
