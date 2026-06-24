import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./db/schema-pg";

const url = process.env.POSTGRES_URL;
if (!url) {
  throw new Error('POSTGRES_URL is required');
}

const client = postgres(url, {
  prepare: false,
});

export const db = drizzle(client, { schema });
