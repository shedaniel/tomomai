import { beforeEach, expect, it, vi } from "vitest";

const proxy = await vi.hoisted(async () => (await import("@/test/pg-proxy")).createProxyDb());
vi.mock("@/lib/db", () => ({ db: proxy.db }));
vi.mock("@/server/services/games/registry", () => ({ GAME_SERVER_MODULES: { maimai: {}, chunithm: {} } }));

import { resolvePublicUserByUsername } from "./public-access";

const published = {
  id: "owner", name: "Owner", publishProfile: true, profileDescription: null, profileMainRegion: "jp", profileShowAllScores: true,
  profileShowScoreDetails: true, profileShowPlates: true, profileShowPlayCounts: true, profileShowEvents: true, profileShowInSearch: true,
};

beforeEach(() => proxy.reset());

it("resolves a published profile with its main region for the requested game", async () => {
  proxy.answer(({ params }) => params.includes("owner") && params.includes("chunithm") ? [published] : []);
  await expect(resolvePublicUserByUsername("chunithm", "owner")).resolves.toMatchObject({ id: "owner", profileMainRegion: "jp" });
  await expect(resolvePublicUserByUsername("chunithm", "stranger")).rejects.toMatchObject({ code: "NOT_FOUND" });
});

it.each(["publishProfile", "profileShowInSearch"])("hides a profile without %s", async flag => {
  proxy.respond([{ ...published, [flag]: false }]);
  await expect(resolvePublicUserByUsername("chunithm", "owner")).rejects.toMatchObject({ code: "NOT_FOUND" });
});
