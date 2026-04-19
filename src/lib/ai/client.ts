import Anthropic from "@anthropic-ai/sdk";

// Fix #8: lazily-instantiated module-level client. Avoids creating a new
// SDK instance (and its keep-alive connection pool) on every request.
let cachedClient: Anthropic | null = null;
let cachedApiKey: string | null = null;

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
