import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type Db = PostgresJsDatabase<typeof schema>;

// Survives dev hot reloads, which would otherwise open a new pool on every edit.
const store = globalThis as typeof globalThis & {
  __guessDb?: { client: postgres.Sql | null; cached: Db | null | undefined };
};
store.__guessDb ??= { client: null, cached: undefined };
const state = store.__guessDb;

/** Lazy client; `null` when `POSTGRES_URL` is unset (local dev, self-host). */
export function getDb(): Db | null {
  if (state.cached !== undefined) return state.cached;
  const url = process.env.POSTGRES_URL;
  if (!url) {
    state.cached = null;
    return null;
  }
  state.client = postgres(url, { prepare: false });
  state.cached = drizzle(state.client, { schema });
  return state.cached;
}

export async function closeDb(): Promise<void> {
  await state.client?.end();
  state.client = null;
  state.cached = undefined;
}
