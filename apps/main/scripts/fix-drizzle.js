import { readMigrationFiles } from 'drizzle-orm/migrator';
import { defineConfig } from "drizzle-kit";
import { config as dotenvConfig } from "dotenv";

dotenvConfig({ path: ".env.local" });

const drizzleConfig = defineConfig({
  schema: "./src/lib/schema.ts",
  out: "./drizzle",
  dialect: "turso",
  dbCredentials: {
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
  },
});

const config = {
  ...drizzleConfig,
  migrationsFolder: drizzleConfig.out,
  migrationsTable: drizzleConfig.migrations?.table ?? '__drizzle_migrations',
  migrationsSchema: drizzleConfig.migrations?.schema ?? 'drizzle',
};

const migrations = readMigrationFiles(config);

const table_name = `${config.migrationsTable}`;

async function main() {
  console.log('~..................¯\\_(ツ)_/¯..................~');
  console.log('Drizzle Migration Hardsync');
  console.log('~...............................................~');
  console.log(
    'If you `drizzle-kit push` you ruin the migration history.\r\nThis script will drop the migration table and create a new one.'
  );
  console.log('~...............................................~');
  console.log('~...............................................~');

  console.log('... Dropping Existing Migration Table');
  // Drop the migration table if it exists
  console.log(`DROP TABLE IF EXISTS ${table_name};`)
  console.log(`CREATE TABLE IF NOT EXISTS ${table_name} (id INTEGER PRIMARY KEY AUTOINCREMENT, hash TEXT, created_at INTEGER);`)

  const values = [];

  for (const migration of migrations) {
    values.push(`(${values.length + 0}, '${migration.hash}', ${migration.folderMillis})`);
  }

  console.log(`INSERT INTO ${table_name} (id, hash, created_at) VALUES ${values.join(', ')};`)

  console.log('~...............................................~');
  console.log('~.. Migration Hardsync Complete! ˶ᵔ ᵕ ᵔ˶........~');
  console.log('~...............................................~');
}

main().catch(console.error);