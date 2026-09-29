import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const statements = vi.hoisted(() => [] as { sql: string; params: unknown[] }[]);
vi.mock("@/lib/db", async () => {
  const { drizzle } = await import("drizzle-orm/pg-proxy");
  return { db: drizzle(async (sql, params) => { statements.push({ sql, params }); return { rows: [] }; }) };
});
vi.mock("@/lib/trpc", async () => {
  const { initTRPC } = await import("@trpc/server");
  const t = initTRPC.context<{ session: { user: { id: string } } }>().create();
  return { router: t.router, protectedProcedure: t.procedure };
});
vi.mock("@/lib/profile-cache", () => ({ revalidateCurrentSitePublicProfile: vi.fn(), revalidateCurrentSitePublicProfileForUser: vi.fn() }));

import { profileRouter } from "./profile";

const now = new Date();
const caller = profileRouter.createCaller({
  req: new NextRequest("http://localhost/api/trpc"),
  session: {
    user: { id: "player", createdAt: now, updatedAt: now, email: "player@example.test", emailVerified: true, name: "Player", banned: false },
    session: { id: "session", userId: "player", token: "test", createdAt: now, updatedAt: now, expiresAt: now },
  },
});

beforeEach(() => {
  statements.length = 0;
  vi.stubEnv("FRONTEND_GAME", "chunithm");
  vi.stubEnv("NEXT_PUBLIC_ENABLED_CHUNITHM_REGIONS", undefined);
  vi.stubEnv("NEXT_PUBLIC_ENABLED_MAIMAI_REGIONS", "intl,jp,cn");
});
afterEach(() => vi.unstubAllEnvs());

describe("account region settings", () => {
  it("rejects a region the served game does not offer, even when another game enables it", async () => {
    await expect(caller.updateRegion({ region: "cn" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.updateProfileMainRegion({ profileMainRegion: "cn" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(statements).toHaveLength(0);
  });

  it("stores a region the served game offers, or clears it", async () => {
    await caller.updateRegion({ region: "jp" });
    await caller.updateRegion({ region: null });
    expect(statements.map(({ sql }) => sql)).toEqual(Array(2).fill('update "user" set "updatedAt" = $1, "region" = $2 where "user"."id" = $3'));
    expect(statements.map(({ params }) => [params[1], params[2]])).toEqual([["jp", "player"], [null, "player"]]);
  });

  it("keeps the main region fixed on the China deployment", async () => {
    vi.stubEnv("FRONTEND_GAME", "maimai");
    vi.stubEnv("NEXT_PUBLIC_ENABLED_MAIMAI_REGIONS", "cn");
    await expect(caller.updateProfileMainRegion({ profileMainRegion: "cn" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(statements).toHaveLength(0);
  });
});
