type Bucket = {
  timestamps: number[];
};

const buckets = new Map<string, Bucket>();

export function assertWithinAiRateLimit(input: { userId: string; limit: number; windowMs: number }) {
  const now = Date.now();
  const key = input.userId;
  const bucket = buckets.get(key) ?? { timestamps: [] };

  const cutoff = now - input.windowMs;
  bucket.timestamps = bucket.timestamps.filter((t) => t >= cutoff);

  if (bucket.timestamps.length >= input.limit) {
    const err = new Error("RATE_LIMITED");
    throw err;
  }

  bucket.timestamps.push(now);
  buckets.set(key, bucket);
}
