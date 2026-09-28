import { afterEach, beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ statements: [] as { sql: string; params: unknown[] }[], rows: [] as unknown[][] }));
vi.mock("@/lib/db", async () => {
  const { drizzle } = await import("drizzle-orm/pg-proxy");
  return { db: drizzle(async (sql, params) => {
    state.statements.push({ sql, params });
    return { rows: sql.startsWith("select") ? state.rows : [] };
  }) };
});
vi.mock("@/lib/request-logger", () => ({ getLogger: () => ({ error: vi.fn() }) }));
import { decryptToken, encryptToken } from "@/lib/token-crypto";
import { deleteToken, readToken, saveToken, updateToken } from "./tokens";

beforeEach(() => {
  state.statements = [];
  state.rows = [];
  vi.stubEnv("TOKEN_SECRET", "12".repeat(32));
});
afterEach(() => vi.unstubAllEnvs());

it.each(["maimai", "chunithm"] as const)("isolates every %s token operation while storing encrypted values", async game => {
  state.rows = [[encryptToken("stored-token")]];
  expect(await readToken(game, "same-owner", "jp")).toBe("stored-token");
  await saveToken(game, "same-owner", "jp", "new-token");
  await updateToken(game, "same-owner", "jp", "refreshed-token");
  await deleteToken(game, "same-owner", "jp");

  const [read, insert, update, remove] = state.statements;
  for (const query of [read, update, remove]) {
    for (const column of ["userId", "game", "region"]) expect(query.sql).toContain(`"user_tokens"."${column}" = $`);
  }
  expect(read.params).toEqual(["same-owner", game, "jp", 1]);
  expect(insert.sql).toMatch(/on conflict \("userId","game","region"\) do update/);
  expect(insert.params.slice(0, 3)).toEqual(["same-owner", game, "jp"]);
  expect(decryptToken(String(insert.params[3]))).toBe("new-token");
  expect(update.params.slice(-3)).toEqual(["same-owner", game, "jp"]);
  expect(decryptToken(String(update.params[0]))).toBe("refreshed-token");
  expect(remove.params).toEqual(["same-owner", game, "jp"]);
});

it("distinguishes a missing token from unreadable stored credentials", async () => {
  expect(await readToken("chunithm", "owner", "intl")).toBeNull();
  state.rows = [["invalid-ciphertext"]];
  await expect(readToken("chunithm", "owner", "intl")).rejects.toThrow("Failed to decrypt stored token");
  expect(state.statements.every(query => query.sql.startsWith("select"))).toBe(true);
});
