import { beforeEach, expect, it, vi } from "vitest";

const proxy = await vi.hoisted(async () => (await import("@/test/pg-proxy")).createProxyDb());
vi.mock("@/lib/db", () => ({ db: proxy.db }));
vi.mock("@/server/services/games/registry", () => ({ GAME_SERVER_MODULES: { maimai: {}, chunithm: {} } }));
const friends = vi.hoisted(() => ({ areFriends: vi.fn() }));
vi.mock("@/server/services/friends/queries", () => friends);

import { resolvePublicUserByUsername } from "./public-access";

const published = {
  id: "owner", name: "Owner", publishProfile: true, profileDescription: null, profileMainRegion: "jp", profileShowAllScores: true,
  profileShowScoreDetails: true, profileShowPlates: true, profileShowPlayCounts: true, profileShowEvents: true, profileShowInSearch: true,
};

beforeEach(() => {
  proxy.reset();
  friends.areFriends.mockReset().mockResolvedValue(false);
});

it("resolves a published profile with its main region for the requested game", async () => {
  proxy.answer(({ params }) => params.includes("owner") && params.includes("chunithm") ? [published] : []);
  await expect(resolvePublicUserByUsername("chunithm", "owner")).resolves.toMatchObject({ id: "owner", profileMainRegion: "jp", access: "public" });
  await expect(resolvePublicUserByUsername("chunithm", "stranger")).rejects.toMatchObject({ code: "NOT_FOUND" });
});

it.each(["publishProfile", "profileShowInSearch"])("hides a profile without %s", async flag => {
  proxy.respond([{ ...published, [flag]: false }]);
  await expect(resolvePublicUserByUsername("chunithm", "owner")).rejects.toMatchObject({ code: "NOT_FOUND" });
});

it("opens a profile shared with friends for a matched friend in the same game", async () => {
  proxy.respond([{ ...published, publishProfile: false, profileShareWithFriends: true }]);
  friends.areFriends.mockResolvedValue(true);
  const profile = await resolvePublicUserByUsername("chunithm", "owner", "friend");
  expect(profile).toMatchObject({ id: "owner", access: "friend" });
  expect(profile).not.toHaveProperty("profileShareWithFriends");
  expect(friends.areFriends).toHaveBeenCalledWith("chunithm", "friend", "owner");
});

it("keeps a profile shared with friends hidden from everyone else", async () => {
  const shared = { ...published, publishProfile: false, profileShareWithFriends: true };
  proxy.respond([shared]);
  await expect(resolvePublicUserByUsername("chunithm", "owner")).rejects.toMatchObject({ code: "NOT_FOUND" });
  proxy.respond([shared]);
  await expect(resolvePublicUserByUsername("chunithm", "owner", "stranger")).rejects.toMatchObject({ code: "NOT_FOUND" });
});
