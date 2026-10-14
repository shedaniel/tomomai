import { getTableColumns, sql, type SQL } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import type { songs } from "@/lib/db/schema-pg";

/** The songs columns an instance upsert replaces. The identity columns (parent, game, region, version) stay. */
export const INSTANCE_UPDATE_COLUMNS = [
  "level", "levelPrecise", "addedVersion", "noteDesigner", "metadata",
  "tapCount", "holdCount", "slideCount", "touchCount", "breakCount",
] as const satisfies readonly (keyof typeof songs.$inferInsert)[];

/** An `onConflictDoUpdate` set that takes each column from the conflicting insert row. */
export function excludedSet<T extends PgTable, K extends keyof T["_"]["columns"] & string>(table: T, columns: readonly K[]): Record<K, SQL> {
  const tableColumns = getTableColumns(table);
  return Object.fromEntries(columns.map(column => [column, sql`excluded.${sql.identifier(tableColumns[column].name)}`])) as Record<K, SQL>;
}
