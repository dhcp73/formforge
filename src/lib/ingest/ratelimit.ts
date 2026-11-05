/** In-memory sliding-window rate limiter (per process). */
const buckets = new Map<string, number[]>();

export function rateLimit(key: string, limit: number, windowMs = 60_000): { ok: boolean; retryAfterS: number; remaining: number } {
  const t = Date.now();
  const arr = (buckets.get(key) ?? []).filter((x) => t - x < windowMs);
  if (arr.length >= limit) {
    buckets.set(key, arr);
    return { ok: false, retryAfterS: Math.ceil((windowMs - (t - arr[0])) / 1000), remaining: 0 };
  }
  arr.push(t);
  buckets.set(key, arr);
  if (buckets.size > 50_000) for (const [k, v] of buckets) if (!v.length || t - v[v.length - 1] > windowMs) buckets.delete(k);
  return { ok: true, retryAfterS: 0, remaining: limit - arr.length };
}

export function resetRateLimits() { buckets.clear(); }
