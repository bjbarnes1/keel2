/**
 * Lazy singleton for the Anthropic SDK.
 *
 * Instantiating `Anthropic` per request would recreate HTTP connection pools; we cache
 * on the module scope keyed by `ANTHROPIC_API_KEY` so key rotation in dev picks up
 * without a full process restart.
 *
 * Returns `null` when `ANTHROPIC_API_KEY` is unset — callers should degrade gracefully
 * (feature flags, user-visible “AI unavailable”, etc.).
 *
 * @module lib/ai/client
 */

import Anthropic from "@anthropic-ai/sdk";

let cachedClient: Anthropic | null = null;
let cachedApiKey: string | null = null;

/** @returns Shared client or `null` if the API key is not configured. */
export function getAnthropicClient(): Anthropic | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  if (cachedClient && cachedApiKey === apiKey) {
    return cachedClient;
  }

  cachedClient = new Anthropic({ apiKey });
  cachedApiKey = apiKey;
  return cachedClient;
}
