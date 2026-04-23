/**
 * Zero-cost pre-checks before LLM calls (length, injection heuristics, obvious off-topic).
 *
 * @module lib/ai/tripwires
 */

export type TripwireResult =
  | { ok: true }
  | { ok: false; reason: string; userMessage: string };

const INJECTION_PATTERNS = [
  /ignore (previous|above) instructions/i,
  /you are now/i,
  /system prompt/i,
  /\bapi[-_ ]?key\b/i,
];

const OFF_TOPIC_KEYWORDS = ["recipe", "code", "joke", "poem", "write me"];

/**
 * Returns a refusal when the input should not reach the model.
 */
export function checkTripwires(input: string): TripwireResult {
  const trimmed = input.trim();
  if (trimmed.length < 2) {
    return { ok: false, reason: "too_short", userMessage: "Try a longer message." };
  }
  if (trimmed.length > 500) {
    return { ok: false, reason: "too_long", userMessage: "Keep messages under 500 characters." };
  }
  if (INJECTION_PATTERNS.some((p) => p.test(trimmed))) {
    return {
      ok: false,
      reason: "injection_attempt",
      userMessage: "I can only help with your budget. Try asking about your money.",
    };
  }
  const lower = trimmed.toLowerCase();
  if (OFF_TOPIC_KEYWORDS.some((k) => lower.includes(k))) {
    return {
      ok: false,
      reason: "off_topic",
      userMessage: "Ask Keel helps with your money. Try asking about income, commitments, or goals.",
    };
  }
  return { ok: true };
}
