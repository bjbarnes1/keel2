import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import { extractJsonObject } from "@/lib/ai/parse-capture";
import { assertWithinAiRateLimit } from "@/lib/ai/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const askResponseSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("goal_projection"),
    headline: z.string().min(1),
    chart: z.object({
      months: z.array(z.string()).min(1),
      todayValue: z.number().finite(),
      targetValue: z.number().finite(),
      targetLabel: z.string().min(1),
    }),
    chips: z.array(z.string()).optional(),
  }),
  z.object({
    type: z.literal("spending_summary"),
    headline: z.string().min(1),
    breakdown: z.array(z.object({ label: z.string().min(1), amount: z.number().finite() })).min(1),
    chips: z.array(z.string()).optional(),
  }),
  z.object({
    type: z.literal("freeform"),
    headline: z.string().min(1),
    body: z.string().optional(),
    chips: z.array(z.string()).optional(),
  }),
]);

export type AskKeelResponse = z.infer<typeof askResponseSchema>;

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.getUser();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    if (!data.user) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    assertWithinAiRateLimit({ userId: data.user.id, limit: 20, windowMs: 60 * 60 * 1000 });

    const body = (await request.json()) as { message?: string };
    const message = String(body.message ?? "").trim();
    if (!message) {
      return NextResponse.json({ error: "Message is required." }, { status: 400 });
    }

    if (process.env.KEEL_AI_ENABLED !== "true") {
      const fallback: AskKeelResponse = {
        type: "freeform",
        headline: "Ask is offline right now.",
        body: "Keel AI is disabled for this environment.",
      };
      return NextResponse.json({ data: fallback });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      const fallback: AskKeelResponse = {
        type: "freeform",
        headline: "Ask is offline right now.",
        body: "Anthropic is not configured.",
      };
      return NextResponse.json({ data: fallback });
    }

    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 700,
      system: `You are Keel's assistant for Australian household cashflow.

Return only valid JSON for one of these shapes (discriminate with "type"):
1) { "type":"goal_projection", "headline": string, "chart": { "months": string[], "todayValue": number, "targetValue": number, "targetLabel": string }, "chips"?: string[] }
2) { "type":"spending_summary", "headline": string, "breakdown": { "label": string, "amount": number }[], "chips"?: string[] }
3) { "type":"freeform", "headline": string, "body"?: string, "chips"?: string[] }

Rules:
- Prefer structured types when the user question clearly matches
- Use AUD thinking; amounts are numbers (not strings)
- Keep headline short; body optional and concise`,
      messages: [{ role: "user", content: message }],
    });

    const textBlock = response.content.find((item) => item.type === "text");
    const text = textBlock?.type === "text" ? textBlock.text : "";
    const parsed = JSON.parse(extractJsonObject(text));
    const dataOut = askResponseSchema.parse(parsed);

    return NextResponse.json({ data: dataOut });
  } catch (error) {
    if (error instanceof Error && error.message === "RATE_LIMITED") {
      return NextResponse.json({ error: "You’ve hit the hourly Ask limit. Try again soon." }, { status: 429 });
    }

    const fallback: AskKeelResponse = {
      type: "freeform",
      headline: "Ask is offline right now.",
    };
    return NextResponse.json({ data: fallback });
  }
}
