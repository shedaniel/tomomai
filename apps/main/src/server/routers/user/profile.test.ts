import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const db = vi.hoisted(() => ({ statements: [] as { sql: string; params: unknown[] }[], rows: [] as unknown[][] }));
vi.mock("@/lib/db", async () => {
  const { drizzle } = await import("drizzle-orm/pg-proxy");
  return { db: drizzle(async (sql, params) => { db.statements.push({ sql, params }); return { rows: db.rows }; }) };
});
vi.mock("@/lib/trpc", async () => {
  const { initTRPC } = await import("@trpc/server");
  const t = initTRPC.context<{ session: { user: { id: string } } }>().create();
  return { router: t.router, protectedProcedure: t.procedure };
});

import { profileRouter } from "./profile";

const now = new Date();
const caller = profileRouter.createCaller({
  req: new NextRequest("http://localhost/api/trpc"),
  session: {
    user: { id: "player", createdAt: now, updatedAt: now, email: "player@example.test", emailVerified: true, name: "Player", banned: false },
    session: { id: "session", userId: "player", token: "test", createdAt: now, updatedAt: now, expiresAt: now },
  },
});

/** The select of a preference: the served game's row, else the account-wide column. */
const preference = (column: string) =>
  `coalesce((select "user_game_preferences"."${column}" from "user_game_preferences" where "user_game_preferences"."userId" = "user"."id" and "user_game_preferences"."game" = $1), "${column}")`;

beforeEach(() => {
  db.statements = [];
  db.rows = [];
  vi.stubEnv("FRONTEND_GAME", "chunithm");
  vi.stubEnv("NEXT_PUBLIC_ENABLED_CHUNITHM_REGIONS", undefined);
  vi.stubEnv("NEXT_PUBLIC_ENABLED_MAIMAI_REGIONS", "intl,jp,cn");
});
afterEach(() => vi.unstubAllEnvs());

describe("region preferences", () => {
  it("rejects a region the served game does not offer, even when another game enables it", async () => {
    await expect(caller.updateRegion({ region: "cn" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.updateProfileMainRegion({ profileMainRegion: "cn" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.statements).toHaveLength(0);
  });

  it("stores each choice in the served game's row only, leaving the other game and preference alone", async () => {
    await caller.updateRegion({ region: "jp" });
    await caller.updateProfileMainRegion({ profileMainRegion: "intl" });
    expect(db.statements.map(({ sql }) => sql)).toEqual([
      'insert into "user_game_preferences" ("userId", "game", "region", "profileMainRegion", "updatedAt") values ($1, $2, $3, default, $4) on conflict ("userId","game") do update set "region" = $5, "updatedAt" = $6',
      'insert into "user_game_preferences" ("userId", "game", "region", "profileMainRegion", "updatedAt") values ($1, $2, default, $3, $4) on conflict ("userId","game") do update set "profileMainRegion" = $5, "updatedAt" = $6',
    ]);
    expect(db.statements.map(({ params }) => [params[0], params[1], params[2], params[4]])).toEqual([
      ["player", "chunithm", "jp", "jp"],
      ["player", "chunithm", "intl", "intl"],
    ]);
  });

  it("stores the maimai site's choice in the maimai row", async () => {
    vi.stubEnv("FRONTEND_GAME", "maimai");
    await caller.updateRegion({ region: "cn" });
    expect(db.statements.map(({ params }) => params.slice(0, 3))).toEqual([["player", "maimai", "cn"]]);
  });

  it("requires a region to store", async () => {
    // @ts-expect-error the input requires a region
    await expect(caller.updateRegion({ region: null })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.statements).toHaveLength(0);
  });

  it("reads the served game's region, falling back to the account column without a row", async () => {
    db.rows = [["player", "player@example.test", true, "user", "jp"]];
    await expect(caller.getUserData()).resolves.toEqual({
      hasUsername: true, username: "player", email: "player@example.test", publishProfile: true, role: "user", region: "jp",
    });
    const [{ sql, params }] = db.statements;
    expect(sql).toBe(`select "username", "email", "publishProfile", "role", ${preference("region")} from "user" where "user"."id" = $2 limit $3`);
    expect(params).toEqual(["chunithm", "player", 1]);
  });

  it("reads the served game's main region with the account-wide profile settings", async () => {
    db.rows = [[true, null, "intl", true, true, true, true, true, true, null]];
    await expect(caller.getProfileSettings()).resolves.toMatchObject({ publishProfile: true, profileMainRegion: "intl" });
    const [{ sql, params }] = db.statements;
    expect(sql).toContain(`"profileDescription", ${preference("profileMainRegion")}, "profileShowAllScores"`);
    expect(params).toEqual(["chunithm", "player", 1]);
  });

  it("keeps the main region fixed on the China deployment", async () => {
    vi.stubEnv("FRONTEND_GAME", "maimai");
    vi.stubEnv("NEXT_PUBLIC_ENABLED_MAIMAI_REGIONS", "cn");
    await expect(caller.updateProfileMainRegion({ profileMainRegion: "cn" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.statements).toHaveLength(0);
  });
});
