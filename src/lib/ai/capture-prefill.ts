/**
 * `?prefill=` query payload when Ask Keel routes a capture intent into the Capture sheet.
 *
 * Encode with {@link encodeCapturePrefillPayload} before pushing `/capture?prefill=…`;
 * {@link decodeCapturePrefillParam} accepts the value from `URLSearchParams` (already
 * percent-decoded by the runtime) or a still-encoded string from tests.
 *
 * @module lib/ai/capture-prefill
 */

import { z } from "zod";

import {
  assetCaptureSchema,
  commitmentCaptureSchema,
  incomeCaptureSchema,
} from "@/lib/ai/capture-schemas";

const captureFromAskSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("commitment"), payload: commitmentCaptureSchema }),
  z.object({ kind: z.literal("income"), payload: incomeCaptureSchema }),
  z.object({ kind: z.literal("asset"), payload: assetCaptureSchema }),
]);

export const capturePrefillPayloadSchema = z.object({
  sentence: z.string().min(1),
  capture: captureFromAskSchema,
});

export type CapturePrefillPayload = z.infer<typeof capturePrefillPayloadSchema>;

/** Percent-encode JSON for use as a single query parameter value. */
export function encodeCapturePrefillPayload(payload: CapturePrefillPayload): string {
  return encodeURIComponent(JSON.stringify(payload));
}

/** Parse `prefill` from the capture URL; returns `null` if missing or invalid. */
export function decodeCapturePrefillParam(param: string | null): CapturePrefillPayload | null {
  if (!param?.trim()) {
    return null;
  }
  let jsonString = param.trim();
  if (jsonString.includes("%")) {
    try {
      jsonString = decodeURIComponent(jsonString);
    } catch {
      return null;
    }
  }
  try {
    const parsed = capturePrefillPayloadSchema.safeParse(JSON.parse(jsonString));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
