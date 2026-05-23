#!/usr/bin/env node
import postgres from "postgres";
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";

const args = process.argv.slice(2);
const yes = args.includes("--yes") || args.includes("-y");
const url = args.find((a) => !a.startsWith("-"));

if (!url) {
  console.error("Usage: node scripts/wipe-pg-schemas.js <postgres-url> [--yes]");
  console.error("Drops public and drizzle schemas (CASCADE) and recreates public.");
  process.exit(1);
}

const redacted = url.replace(/\/\/([^:]+):([^@]+)@/, "//$1:***@");
console.log(`Target: ${redacted}`);

const sql = postgres(url, { max: 1, onnotice: () => {} });

try {
  const [{ current_database, current_user }] =
    await sql`SELECT current_database(), current_user`;
  console.log(`Database: ${current_database}   User: ${current_user}`);

  const tables = await sql`
    SELECT schemaname, COUNT(*)::int AS n
    FROM pg_tables
    WHERE schemaname IN ('public', 'drizzle')
    GROUP BY schemaname
    ORDER BY schemaname
  `;
  console.log("Tables to drop:", tables.length ? tables : "none");

  if (!yes) {
    const rl = readline.createInterface({ input: stdin, output: stdout });
    const ans = await rl.question(
      `\nThis will DROP SCHEMA public CASCADE and DROP SCHEMA drizzle CASCADE. Type "WIPE" to confirm: `,
    );
    rl.close();
    if (ans.trim() !== "WIPE") {
      console.log("Aborted.");
      process.exit(1);
    }
  }

  await sql`DROP SCHEMA IF EXISTS public CASCADE`;
  await sql`DROP SCHEMA IF EXISTS drizzle CASCADE`;
  await sql`CREATE SCHEMA public`;
  await sql`GRANT ALL ON SCHEMA public TO public`;

  console.log("Done. public schema recreated empty; drizzle schema dropped.");
} finally {
  await sql.end();
}
