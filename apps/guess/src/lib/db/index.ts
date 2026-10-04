import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type Db = PostgresJsDatabase<typeof schema>;

let client: postgres.Sql | null = null;
let cached: Db | null | undefined;

/** Lazy client; `null` when `POSTGRES_URL` is unset (local dev, self-host). */
export function getDb(): Db | null {
  if (cached !== undefined) return cached;
  const url = process.env.POSTGRES_URL;
  if (!url) {
    cached = null;
    return null;
  }
  client = postgres(url, { prepare: false });
  cached = drizzle(client, { schema });
  return cached;
}

export async function closeDb(): Promise<void> {
  await client?.end();
  client = null;
  cached = undefined;
}
