import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

// Client is created lazily so the build step never needs DATABASE_URL.
let _client: ReturnType<typeof postgres> | null = null;

function getClient(): ReturnType<typeof postgres> {
  if (!_client) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    _client = postgres(url, { max: 5 });
  }
  return _client;
}

export function getDb() {
  return drizzle(getClient());
}

export async function pingDb(): Promise<boolean> {
  try {
    const client = getClient();
    await client`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}
