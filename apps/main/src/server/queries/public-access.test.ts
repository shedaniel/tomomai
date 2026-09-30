import { beforeEach, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ statements: [] as { sql: string; params: unknown[] }[], rows: [] as unknown[][] }));
vi.mock("@/lib/db", async () => {
  const { drizzle } = await import("drizzle-orm/pg-proxy");
  return { db: drizzle(async (sql, params) => { db.statements.push({ sql, params }); return { rows: db.rows }; }) };
});
vi.mock("@/server/services/games/registry", () => ({ GAME_SERVER_MODULES: { maimai: {}, chunithm: {} } }));

import { resolvePublicUserByUsername } from "./public-access";

beforeEach(() => {
  db.statements = [];
  db.rows = [];
});

it("resolves a published profile with its main region for the requested game", async () => {
  db.rows = [["owner", "Owner", true, null, "jp", true, true, true, true, true, true]];
  await expect(resolvePublicUserByUsername("chunithm", "owner")).resolves.toMatchObject({ id: "owner", profileMainRegion: "jp" });
  const [{ sql, params }] = db.statements;
  expect(sql).toContain('coalesce((select "user_game_preferences"."profileMainRegion" from "user_game_preferences" where "user_game_preferences"."userId" = "user"."id" and "user_game_preferences"."game" = $1), "profileMainRegion")');
  expect(params).toEqual(["chunithm", "owner", 1]);
});
