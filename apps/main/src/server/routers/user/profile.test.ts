import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const proxy = await vi.hoisted(async () => (await import("@/test/pg-proxy")).createProxyDb());
vi.mock("@/lib/db", () => ({ db: proxy.db }));
vi.mock("@/server/queries/game-preferences", async importOriginal => ({
  ...await importOriginal<typeof import("@/server/queries/game-preferences")>(),
  saveGamePreference: vi.fn(),
}));
vi.mock("@/lib/trpc", async () => {
  const { initTRPC } = await import("@trpc/server");
  const t = initTRPC.context<{ session: { user: { id: string } } }>().create();
  return { router: t.router, protectedProcedure: t.procedure };
});

import { saveGamePreference } from "@/server/queries/game-preferences";
import { profileRouter } from "./profile";

const now = new Date();
const caller = profileRouter.createCaller({
  req: new NextRequest("http://localhost/api/trpc"),
  session: {
    user: { id: "player", createdAt: now, updatedAt: now, email: "player@example.test", emailVerified: true, name: "Player", banned: false },
    session: { id: "session", userId: "player", token: "test", createdAt: now, updatedAt: now, expiresAt: now },
  },
});

// The player's row answers only a read of the player that asks for the served game's preference.
const answerFor = (row: Record<string, unknown>) => proxy.answer(({ params }) => params.includes("player") && params.includes("chunithm") ? [row] : []);

beforeEach(() => {
  vi.clearAllMocks();
  proxy.reset();
  vi.stubEnv("FRONTEND_GAME", "chunithm");
  vi.stubEnv("NEXT_PUBLIC_ENABLED_CHUNITHM_REGIONS", undefined);
  vi.stubEnv("NEXT_PUBLIC_ENABLED_MAIMAI_REGIONS", "intl,jp,cn");
});
afterEach(() => vi.unstubAllEnvs());

describe("region preferences", () => {
  it("rejects a region the served game does not offer, even when another game enables it", async () => {
    await expect(caller.updateRegion({ region: "cn" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.updateProfileMainRegion({ profileMainRegion: "cn" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(saveGamePreference).not.toHaveBeenCalled();
  });

  it("stores each choice as the served game's preference", async () => {
    await caller.updateRegion({ region: "jp" });
    await caller.updateProfileMainRegion({ profileMainRegion: "intl" });
    vi.stubEnv("FRONTEND_GAME", "maimai");
    await caller.updateRegion({ region: "cn" });
    expect(vi.mocked(saveGamePreference).mock.calls).toEqual([
      ["chunithm", "player", { region: "jp" }],
      ["chunithm", "player", { profileMainRegion: "intl" }],
      ["maimai", "player", { region: "cn" }],
    ]);
    expect(proxy.queries).toEqual([]);
  });

  it("requires a region to store", async () => {
    // @ts-expect-error the input requires a region
    await expect(caller.updateRegion({ region: null })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(saveGamePreference).not.toHaveBeenCalled();
  });

  it("reads the served game's region", async () => {
    answerFor({ username: "player", email: "player@example.test", publishProfile: true, role: "user", region: "jp" });
    await expect(caller.getUserData()).resolves.toEqual({
      hasUsername: true, username: "player", email: "player@example.test", publishProfile: true, role: "user", region: "jp",
    });
  });

  it("reads the served game's main region with the account-wide profile settings", async () => {
    answerFor({
      publishProfile: true, profileDescription: null, profileMainRegion: "intl", profileShowAllScores: true, profileShowScoreDetails: true,
      profileShowPlates: true, profileShowPlayCounts: true, profileShowEvents: true, profileShowInSearch: true, fetchUseAlbums: null,
    });
    await expect(caller.getProfileSettings()).resolves.toMatchObject({ publishProfile: true, profileMainRegion: "intl" });
  });

  it("keeps the main region fixed on the China deployment", async () => {
    vi.stubEnv("FRONTEND_GAME", "maimai");
    vi.stubEnv("NEXT_PUBLIC_ENABLED_MAIMAI_REGIONS", "cn");
    await expect(caller.updateProfileMainRegion({ profileMainRegion: "cn" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(saveGamePreference).not.toHaveBeenCalled();
  });
});
