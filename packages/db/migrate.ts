import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import path from "path";

export async function runMigrations(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  // Separate short-lived connection just for migrations.
  const client = postgres(url, { max: 1 });
  const db = drizzle(client);

  const migrationsFolder =
    process.env.MIGRATIONS_PATH ?? path.join(process.cwd(), "migrations");

  await migrate(db, { migrationsFolder });

  await client.end();
}
