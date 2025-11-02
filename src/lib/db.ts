import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./db/schema-pg";

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL!,
});

export const db = drizzle(pool, { schema }); 