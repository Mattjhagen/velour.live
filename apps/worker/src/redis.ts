import Redis from "ioredis";

let _client: Redis | null = null;

export function getRedis(): Redis {
  if (!_client) {
    const url = process.env.REDIS_URL;
    if (!url) throw new Error("REDIS_URL is not set");
    _client = new Redis(url, { maxRetriesPerRequest: 1 });
  }
  return _client;
}
