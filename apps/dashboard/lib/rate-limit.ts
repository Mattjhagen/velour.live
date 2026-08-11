import { getRedis } from "@/lib/redis";

/**
 * Fixed-window rate limiter backed by Redis.
 * Returns { allowed, remaining } so callers can set Retry-After headers.
 */
export async function checkRateLimit(
  key: string,
  max: number,
  windowSec: number,
): Promise<{ allowed: boolean; remaining: number }> {
  const fullKey = `ratelimit:${key}`;
  const results = await getRedis()
    .pipeline()
    .incr(fullKey)
    .expire(fullKey, windowSec, "NX") // set TTL only on first request in window
    .exec();

  const count = (results?.[0]?.[1] ?? 1) as number;
  const remaining = Math.max(0, max - count);
  return { allowed: count <= max, remaining };
}
