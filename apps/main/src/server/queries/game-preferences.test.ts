import { beforeEach, expect, it, vi } from "vitest";

const proxy = await vi.hoisted(async () => (await import("@/test/pg-proxy")).createProxyDb());
vi.mock("@/lib/db", () => ({ db: proxy.db }));

import { account, user } from "@/lib/db/schema-pg";
import { eq } from "drizzle-orm";
import { gamePreference, saveGamePreference } from "./game-preferences";

const fromRow = (column: string) =>
  `(select "user_game_preferences"."${column}" from "user_game_preferences" where "user_game_preferences"."userId" = "user"."id" and "user_game_preferences"."game" = $1)`;

beforeEach(() => proxy.reset());

it("reads only the game's preference row of the selected user", async () => {
  await proxy.db.select({ region: gamePreference("chunithm", "region") }).from(user);
  await proxy.db.select({ main: gamePreference("maimai", "profileMainRegion") }).from(user).innerJoin(account, eq(account.userId, user.id));
  expect(proxy.queries.map(({ sql, params }) => ({ sql, params }))).toEqual([
    { sql: `select ${fromRow("region")} from "user"`, params: ["chunithm"] },
    { sql: `select ${fromRow("profileMainRegion")} from "user" inner join "account" on "account"."userId" = "user"."id"`, params: ["maimai"] },
  ]);
});

it("stores only the changed preference in the game's row", async () => {
  await saveGamePreference("chunithm", "player", { region: "jp" });
  await saveGamePreference("maimai", "player", { profileMainRegion: "intl" });
  expect(proxy.queries.map(({ sql }) => sql)).toEqual([
    'insert into "user_game_preferences" ("userId", "game", "region", "profileMainRegion", "updatedAt") values ($1, $2, $3, default, $4) on conflict ("userId","game") do update set "region" = $5, "updatedAt" = $6',
    'insert into "user_game_preferences" ("userId", "game", "region", "profileMainRegion", "updatedAt") values ($1, $2, default, $3, $4) on conflict ("userId","game") do update set "profileMainRegion" = $5, "updatedAt" = $6',
  ]);
  expect(proxy.queries.map(({ params }) => [params[0], params[1], params[2], params[4]])).toEqual([
    ["player", "chunithm", "jp", "jp"],
    ["player", "maimai", "intl", "intl"],
  ]);
});
