import { Column, getTableColumns, is, type Table } from "drizzle-orm";
import { drizzle, type RemoteCallback } from "drizzle-orm/pg-proxy";
import type { SelectedFieldsOrdered } from "drizzle-orm/pg-core";

/**
 * A statement the code under test ran. `table` is the table it reads or writes, taken from the statement
 * itself, so subqueries in a select list do not count.
 */
export type ProxyQuery = { sql: string; params: unknown[]; table: string | undefined; inTransaction: boolean };

/**
 * One result row keyed like the query's result: the selection's keys (the column keys for a whole-row select),
 * nested objects for nested selections. A selected column also reads its key in its table, so one stored table
 * row answers every select of that table's columns. Keys nothing selects are ignored, and selected values the
 * row lacks read as null. Values are what Postgres sends, so timestamps are "YYYY-MM-DD hh:mm:ss" strings.
 */
export type ProxyRow = Record<string, unknown>;

export type ProxyAnswer = (query: ProxyQuery) => ProxyRow[] | undefined;

/**
 * A Drizzle database on the pg-proxy driver for query tests. Mock `@/lib/db` with it:
 *
 *   const proxy = await vi.hoisted(async () => (await import("@/test/pg-proxy")).createProxyDb());
 *   vi.mock("@/lib/db", () => ({ db: proxy.db }));
 *
 * Each query answers from `answer` when it returns rows, else from the next `respond` result, else with no rows.
 * `db.transaction` runs its work on the same connection and records begin, commit and rollback.
 */
export function createProxyDb() {
  const queries: ProxyQuery[] = [];
  const transactions: ("begin" | "commit" | "rollback")[] = [];
  const queued: ProxyRow[][] = [];
  let answer: ProxyAnswer | undefined;
  let inTransaction = false;

  const db = drizzle(async () => { throw new Error("Every proxy query runs through its prepared statement's client"); });
  const session = db._.session;
  const prepare = session.prepareQuery.bind(session);
  session.prepareQuery = (query, fields, ...rest) => {
    const prepared = prepare(query, fields, ...rest);
    const client: RemoteCallback = async (sql, params, method) => {
      const recorded: ProxyQuery = { sql, params, table: statementTable(sql), inTransaction };
      queries.push(recorded);
      const rows = answer?.(recorded) ?? queued.shift() ?? [];
      return { rows: method === "all" && fields ? rows.map(row => toDriverRow(fields, row)) : rows };
    };
    return Object.assign(prepared, { client });
  };
  session.transaction = async work => {
    transactions.push("begin");
    inTransaction = true;
    try {
      const result = await work(db as unknown as Parameters<typeof work>[0]);
      transactions.push("commit");
      return result;
    } catch (err) {
      transactions.push("rollback");
      throw err;
    } finally {
      inTransaction = false;
    }
  };

  return {
    db,
    queries,
    transactions,
    /** Queues one result per query, in the order the queries run. */
    respond(...results: ProxyRow[][]) {
      queued.push(...results);
    },
    answer(next: ProxyAnswer) {
      answer = next;
    },
    /** The rows every insert into `table` wrote. */
    inserted(table: string): Record<string, unknown>[] {
      return queries.filter(query => query.sql.startsWith(`insert into "${table}" `)).flatMap(insertedRows);
    },
    /** Each update of `table`: the values it sets, keyed by column, and the values its where clause compares. */
    updated(table: string): { values: Record<string, unknown>; where: unknown[] }[] {
      return queries.filter(query => query.sql.startsWith(`update "${table}" set `)).map(updatedRow);
    },
    reset() {
      queries.length = 0;
      transactions.length = 0;
      queued.length = 0;
      answer = undefined;
    },
  };
}

function toDriverRow(fields: SelectedFieldsOrdered, row: ProxyRow): unknown[] {
  return fields.map(({ path, field }) => {
    const [found, value] = valueAt(row, path);
    if (found) return value ?? null;
    const key = is(field, Column) ? columnKey(field) : undefined;
    return key !== undefined && key in row ? row[key] ?? null : null;
  });
}

function valueAt(row: ProxyRow, path: string[]): [found: boolean, value: unknown] {
  let node: unknown = row;
  for (const key of path) {
    if (node === null) return [true, null];
    if (typeof node !== "object" || !(key in node)) return [false, undefined];
    node = (node as Record<string, unknown>)[key];
  }
  return [true, node];
}

const columnKeys = new WeakMap<Table, Map<Column, string>>();

function columnKey(column: Column): string | undefined {
  let keys = columnKeys.get(column.table);
  if (!keys) {
    keys = new Map(Object.entries(getTableColumns(column.table)).map(([key, tableColumn]) => [tableColumn, key]));
    columnKeys.set(column.table, keys);
  }
  return keys.get(column);
}

/** The rows one insert statement writes, keyed by column. A column left to its default reads as undefined. */
export function insertedRows({ sql, params }: Pick<ProxyQuery, "sql" | "params">): Record<string, unknown>[] {
  const header = /^insert into "\w+" \(([^)]*)\) values /.exec(sql);
  if (!header) throw new Error(`Not a plain insert: ${sql}`);
  const columns = header[1].split(", ").map(column => column.slice(1, -1));
  const rows: Record<string, unknown>[] = [];
  let rest = sql.slice(header[0].length);
  while (rest.startsWith("(")) {
    const end = closingParen(rest);
    const values = splitTopLevel(rest.slice(1, end));
    rows.push(Object.fromEntries(columns.map((column, index) => [column, sqlValue(values[index], params)])));
    rest = rest.slice(end + 1).replace(/^, /, "");
  }
  return rows;
}

/** The columns an insert's on-conflict update copies from the row it tried to insert. */
export function conflictCopiedColumns({ sql }: Pick<ProxyQuery, "sql">): string[] {
  const update = sql.indexOf(" on conflict ");
  if (update === -1) return [];
  return [...sql.slice(update).matchAll(/"(\w+)" = excluded\."\1"/g)].map(([, column]) => column);
}

function updatedRow({ sql, params }: ProxyQuery): { values: Record<string, unknown>; where: unknown[] } {
  const assignments = sql.slice(sql.indexOf(" set ") + " set ".length);
  const whereAt = topLevelIndex(assignments, " where ");
  const values = splitTopLevel(whereAt === -1 ? assignments : assignments.slice(0, whereAt)).map(assignment => {
    const equals = assignment.indexOf(" = ");
    return [assignment.slice(1, equals - 1), sqlValue(assignment.slice(equals + " = ".length), params)];
  });
  const where = whereAt === -1 ? [] : [...assignments.slice(whereAt).matchAll(/\$(\d+)/g)].map(([, index]) => params[Number(index) - 1]);
  return { values: Object.fromEntries(values), where };
}

function topLevelIndex(sql: string, token: string): number {
  let depth = 0;
  for (let index = 0; index < sql.length; index++) {
    if (sql[index] === "(") depth++;
    else if (sql[index] === ")") depth--;
    else if (depth === 0 && sql.startsWith(token, index)) return index;
  }
  return -1;
}

function sqlValue(value: string, params: unknown[]): unknown {
  if (value === "default") return undefined;
  const param = /^\$(\d+)$/.exec(value);
  return param ? params[Number(param[1]) - 1] : value;
}

function closingParen(sql: string): number {
  let depth = 0;
  for (let index = 0; index < sql.length; index++) {
    if (sql[index] === "(") depth++;
    else if (sql[index] === ")" && --depth === 0) return index;
  }
  throw new Error(`Unbalanced parentheses: ${sql}`);
}

function splitTopLevel(list: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < list.length; index++) {
    if (list[index] === "(") depth++;
    else if (list[index] === ")") depth--;
    else if (depth === 0 && list.startsWith(", ", index)) {
      parts.push(list.slice(start, index));
      start = index + 2;
    }
  }
  return [...parts, list.slice(start)];
}

function statementTable(sql: string): string | undefined {
  const written = /^(?:insert into|update|delete from) "(\w+)"/.exec(sql);
  if (written) return written[1];
  const from = topLevelIndex(sql, " from \"");
  return from === -1 ? undefined : /^ from "(\w+)"/.exec(sql.slice(from))?.[1];
}
