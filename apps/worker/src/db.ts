import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@velour/db";

let _db: ReturnType<typeof drizzle> | null = null;

export function getDb() {
  if (!_db) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    _db = drizzle(postgres(url), { schema });
  }
  return _db;
}
