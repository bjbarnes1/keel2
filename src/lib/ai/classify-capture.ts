/**
 * Sentence classifier for the Capture flow (“Rent is $500 weekly…”).
 *
 * Routes free text into commitment vs income vs wealth asset buckets before the heavier
 * parsers run. Returns `unknown` when the model is unavailable or the sentence is not
 * clearly financial — callers should fall back to manual forms.
 *
 * @module lib/ai/classify-capture
 */

import { z } from "zod";

import type { AnthropicUsageSlice } from "@/lib/ai/classify-ask";
import { getAnthropicClient } from "@/lib/ai/client";
import { extractJsonObject } from "@/lib/ai/parse-capture";
import { trackAnthropicCompletion } from "@/lib/ai/rate-limit";

const classificationSchema = z.object({
  kind: z.enum(["commitment", "income", "asset", "unknown"]),
});

export type CaptureKind = z.infer<typeof classificationSchema>["kind"];

export type ClassifyCaptureResult = {
  kind: CaptureKind;
  usage?: AnthropicUsageSlice;
};

export async function classifyCaptureSentence(
  sentence: string,
  costContext?: { userId: string },
): Promise<ClassifyCaptureResult> {
  const trimmed = sentence.trim();
  if (!trimmed) {
    return { kind: "unknown" };
  }

  const client = getAnthropicClient();
  if (!client) {
    return { kind: "unknown" };
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
  const kind = classificationSchema.parse(parsed).kind;
  if (costContext) {
    await trackAnthropicCompletion({
      userId: costContext.userId,
      model: "claude-3-5-haiku-20241022",
      usage: response.usage,
    });
  }
  return { kind, usage: response.usage ?? undefined };
}
