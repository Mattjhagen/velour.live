import Redis from "ioredis";

// Client is created lazily so the build step never needs REDIS_URL.
let _client: Redis | null = null;

export function getRedis(): Redis {
  if (!_client) {
    const url = process.env.REDIS_URL;
    if (!url) throw new Error("REDIS_URL is not set");
    _client = new Redis(url, { maxRetriesPerRequest: 1 });
  }
  return _client;
}

export async function pingRedis(): Promise<boolean> {
  try {
    const result = await getRedis().ping();
    return result === "PONG";
  } catch {
    return false;
  }
}
