/**
 * Streaming Ask Keel “answer” path: Sonnet streams plain prose, then Haiku emits citations JSON.
 *
 * Wire format: newline-delimited JSON (NDJSON), one object per line:
 * - `{ "type":"text", "delta": string }` — append to the assistant bubble
 * - `{ "type":"complete", "data": AskKeelResponse }` — final structured payload (`freeform`)
 *
 * @module lib/ai/ask-stream
 */

import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import { buildAskContextSnapshot, formatAskSnapshotForPrompt } from "@/lib/ai/ask-context";
import { validateFreeformCitations } from "@/lib/ai/ask-citations";
import type { AskIntentClassification } from "@/lib/ai/classify-ask";
import { askResponseSchema, type AskKeelResponse } from "@/lib/ai/ask-keel-schema";
import { extractJsonObject } from "@/lib/ai/parse-capture";
import {
  assertWithinAiCostCeil,
  defaultAiCostCeilingCentsAud,
  trackAnthropicCompletion,
} from "@/lib/ai/rate-limit";

const HAIKU_MODEL = "claude-haiku-4-5-20251001";
const SONNET_MODEL = "claude-sonnet-4-6";

const citationExtractSchema = z.object({
  citations: z
    .array(
      z.object({
        ref: z.string().min(1),
        label: z.string().min(1),
        amount: z.number().finite().optional(),
        dateIso: z.string().optional(),
      }),
    )
    .optional(),
  confidence: z.enum(["high", "medium", "low"]).optional(),
});

type CitationRow = {
  ref: string;
  label: string;
  amount?: number;
  dateIso?: string;
};

async function extractCitationsFromProse(
  client: Anthropic,
  userId: string,
  answerText: string,
  snapshotJson: string,
): Promise<{ citations: CitationRow[]; confidence?: "high" | "medium" | "low" }> {
  const response = await client.messages.create({
    model: HAIKU_MODEL,
    max_tokens: 350,
    system: `You map a short assistant answer to citation rows for a budgeting app.

Return only JSON:
{ "citations"?: Array<{ "ref": string, "label": string, "amount"?: number, "dateIso"?: string }>, "confidence"?: "high"|"medium"|"low" }

Rules:
- Each "ref" MUST be copied exactly from the allow-list block inside SNAPSHOT_JSON.
- Only include citations for facts the answer text clearly states from the snapshot.
- If nothing is citable, return { "citations": [], "confidence": "low" }.
- confidence reflects how well the answer is supported by the snapshot.`,
    messages: [
      {
        role: "user",
        content: `SNAPSHOT_JSON:\n${snapshotJson}\n\nANSWER_TEXT:\n${answerText}`,
      },
    ],
  });
  await trackAnthropicCompletion({ userId, model: HAIKU_MODEL, usage: response.usage });
  const textBlock = response.content.find((item) => item.type === "text");
  const text = textBlock?.type === "text" ? textBlock.text : "";
  try {
    const parsed = citationExtractSchema.parse(JSON.parse(extractJsonObject(text)));
    return {
      citations: parsed.citations ?? [],
      confidence: parsed.confidence,
    };
  } catch {
    return { citations: [], confidence: "low" };
  }
}

function ndjsonLine(obj: unknown) {
  return `${JSON.stringify(obj)}\n`;
}

/**
 * Builds an HTTP streaming response for Ask when the client sets `{ stream: true }`.
 *
 * `intent` must already be classified by the caller (route.ts) — this avoids a duplicate
 * Haiku call and guarantees only "answer"-kind intents reach the streaming prose path.
 * Non-answer intents should be handled before calling this function.
 */
export function createStreamingAskResponse(input: {
  client: Anthropic;
  userId: string;
  message: string;
  intent: AskIntentClassification;
}): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(ndjsonLine(obj)));
      try {
        const ceiling = defaultAiCostCeilingCentsAud();
        if ((await assertWithinAiCostCeil({ userId: input.userId, ceilingCentsAud: ceiling })).ok === false) {
          send({
            type: "complete",
            data: askResponseSchema.parse({
              type: "freeform",
              headline: "You've used Ask Keel's quota for today.",
              body: "It'll refresh tomorrow.",
            }),
          });
          controller.close();
          return;
        }

        if ((await assertWithinAiCostCeil({ userId: input.userId, ceilingCentsAud: ceiling })).ok === false) {
          send({
            type: "complete",
            data: askResponseSchema.parse({
              type: "freeform",
              headline: "You've used Ask Keel's quota for today.",
              body: "It'll refresh tomorrow.",
            }),
          });
          controller.close();
          return;
        }

        const snapshot = await buildAskContextSnapshot({ userId: input.userId });
        const snapshotPrompt = formatAskSnapshotForPrompt(snapshot);

        const proseStream = await input.client.messages.stream({
          model: SONNET_MODEL,
          max_tokens: 400,
          temperature: 0.2,
          system: `${snapshotPrompt}

You are Ask Keel. Reply in calm Australian English with 2–5 short sentences of plain text only (no JSON, no markdown, no bullet lists).
Use only facts present in GROUNDED_SNAPSHOT_JSON. If you cannot answer from the snapshot, say what is missing.`,
          messages: [{ role: "user", content: input.message }],
        });

        let full = "";
        for await (const event of proseStream) {
          if (event.type === "content_block_delta") {
            const delta = event.delta;
            if (delta.type === "text_delta" && "text" in delta && typeof delta.text === "string") {
              full += delta.text;
              send({ type: "text", delta: delta.text });
            }
          }
        }

        const finalMessage = await proseStream.finalMessage();
        await trackAnthropicCompletion({
          userId: input.userId,
          model: SONNET_MODEL,
          usage: finalMessage.usage,
        });

        const trimmed = full.trim();
        const headline = trimmed.split("\n")[0]?.slice(0, 120) || "Answer";
        const body = trimmed.includes("\n") ? trimmed.split("\n").slice(1).join("\n").trim() : trimmed;

        if ((await assertWithinAiCostCeil({ userId: input.userId, ceilingCentsAud: ceiling })).ok === false) {
          send({
            type: "complete",
            data: askResponseSchema.parse({
              type: "freeform",
              headline: "You've used Ask Keel's quota for today.",
              body: "It'll refresh tomorrow.",
            }),
          });
          controller.close();
          return;
        }

        const extracted = await extractCitationsFromProse(
          input.client,
          input.userId,
          trimmed,
          JSON.stringify(snapshot),
        );

        const citations = extracted.citations;
        const citeCheck = validateFreeformCitations(citations, snapshot);
        const dataOut: AskKeelResponse = citeCheck.ok
          ? {
              type: "freeform",
              headline,
              body: body.length > 0 ? body : undefined,
              citations: citations.length ? citations : undefined,
              confidence: extracted.confidence,
            }
          : {
              type: "freeform",
              headline: "I'm having trouble matching that to your data.",
              body: "Try rephrasing, or check Timeline for the exact figures.",
              answerValidationFailed: true,
              confidence: "low",
            };

        send({ type: "complete", data: askResponseSchema.parse(dataOut) });
        controller.close();
      } catch (err) {
        console.error("[ask-keel] stream error", err);
        controller.enqueue(
          encoder.encode(
            ndjsonLine({
              type: "complete",
              data: askResponseSchema.parse({
                type: "freeform",
                headline: "Ask is offline right now.",
              }),
            }),
          ),
        );
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
