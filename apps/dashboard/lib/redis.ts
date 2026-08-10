import Redis from "ioredis";

const url = process.env.REDIS_URL;
if (!url) throw new Error("REDIS_URL is not set");

const redisUrl: string = url;

// Lazy singleton — created on first import.
let _client: Redis | null = null;

export function getRedis(): Redis {
  if (!_client) {
    _client = new Redis(redisUrl, { maxRetriesPerRequest: 1 });
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
