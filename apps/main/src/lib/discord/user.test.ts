import { beforeEach, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ statements: [] as { sql: string; params: unknown[] }[], rows: [] as unknown[][] }));
vi.mock("@/lib/db", async () => {
  const { drizzle } = await import("drizzle-orm/pg-proxy");
  return { db: drizzle(async (sql, params) => { db.statements.push({ sql, params }); return { rows: db.rows }; }) };
});

import { findDiscordUser } from "./user";

beforeEach(() => {
  db.statements = [];
  db.rows = [];
});

it("reads the linked account with its maimai region preference", async () => {
  db.rows = [["user-1", "Player", "player", "jp"]];
  await expect(findDiscordUser("discord-1")).resolves.toEqual({ id: "user-1", name: "Player", username: "player", region: "jp" });
  const [{ sql, params }] = db.statements;
  expect(sql).toContain('coalesce((select "user_game_preferences"."region" from "user_game_preferences" where "user_game_preferences"."userId" = "user"."id" and "user_game_preferences"."game" = $1), "user"."region")');
  expect(sql).toContain('inner join "account" on "account"."userId" = "user"."id"');
  expect(params).toEqual(["maimai", "discord-1", "discord", 1]);
});

it("answers null for a Discord user without a linked account", async () => {
  await expect(findDiscordUser("discord-1")).resolves.toBeNull();
});
