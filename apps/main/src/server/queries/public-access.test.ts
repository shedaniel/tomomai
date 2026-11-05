import { beforeEach, expect, it, vi } from "vitest";

const proxy = await vi.hoisted(async () => (await import("@/test/pg-proxy")).createProxyDb());
vi.mock("@/lib/db", () => ({ db: proxy.db }));
vi.mock("@/server/services/games/registry", () => ({ GAME_SERVER_MODULES: { maimai: {}, chunithm: {} } }));
const friends = vi.hoisted(() => ({ areFriends: vi.fn() }));
vi.mock("@/server/services/friends/queries", () => friends);

import { resolvePublicUserByUsername } from "./public-access";

const PUBLIC = {
  id: "owner", name: "Owner", profileDescription: null, profileMainRegion: "jp", profileVisibility: "public",
  profileAllScoresAudience: "public", profileScoreDetailsAudience: "public", profilePlatesAudience: "public",
  profilePlayCountsAudience: "public", profileEventsAudience: "public", profileShowInSearch: true,
};

beforeEach(() => {
  proxy.reset();
  friends.areFriends.mockReset().mockResolvedValue(false);
});

it("resolves a public profile with its main region for the requested game", async () => {
  proxy.answer(({ params }) => params.includes("owner") && params.includes("chunithm") ? [PUBLIC] : []);
  await expect(resolvePublicUserByUsername("chunithm", "owner")).resolves.toMatchObject({
    id: "owner", profileMainRegion: "jp", access: "public", profileShowAllScores: true, profileShowInSearch: true,
  });
  await expect(resolvePublicUserByUsername("chunithm", "stranger")).rejects.toMatchObject({ code: "NOT_FOUND" });
});

it("serves an unlisted public profile, which only search and the sitemap leave out", async () => {
  proxy.respond([{ ...PUBLIC, profileShowInSearch: false }]);
  await expect(resolvePublicUserByUsername("chunithm", "owner")).resolves.toMatchObject({ id: "owner", profileShowInSearch: false, access: "public" });
});

it("hides a private profile from everyone, friends included", async () => {
  friends.areFriends.mockResolvedValue(true);
  proxy.respond([{ ...PUBLIC, profileVisibility: "private" }]);
  await expect(resolvePublicUserByUsername("chunithm", "owner", "friend")).rejects.toMatchObject({ code: "NOT_FOUND" });
});

it("opens a friends-only profile for a matched friend in the same game, unlisted", async () => {
  proxy.respond([{ ...PUBLIC, profileVisibility: "friends" }]);
  friends.areFriends.mockResolvedValue(true);
  const profile = await resolvePublicUserByUsername("chunithm", "owner", "friend");
  expect(profile).toMatchObject({ id: "owner", access: "friend", profileShowAllScores: true, profileShowInSearch: false });
  expect(profile).not.toHaveProperty("audiences");
  expect(friends.areFriends).toHaveBeenCalledWith("chunithm", "friend", "owner");
});

it("keeps a friends-only profile hidden from everyone else", async () => {
  const shared = { ...PUBLIC, profileVisibility: "friends" };
  proxy.respond([shared]);
  await expect(resolvePublicUserByUsername("chunithm", "owner")).rejects.toMatchObject({ code: "NOT_FOUND" });
  proxy.respond([shared]);
  await expect(resolvePublicUserByUsername("chunithm", "owner", "stranger")).rejects.toMatchObject({ code: "NOT_FOUND" });
});

it("shows a friend the parts of a public profile kept for friends, and the public only the public parts", async () => {
  const profile = { ...PUBLIC, profilePlayCountsAudience: "friends", profileEventsAudience: "private" };
  proxy.respond([profile]);
  await expect(resolvePublicUserByUsername("chunithm", "owner", "stranger")).resolves.toMatchObject({
    access: "public", profileShowPlayCounts: false, profileShowEvents: false,
  });
  friends.areFriends.mockResolvedValue(true);
  proxy.respond([profile]);
  await expect(resolvePublicUserByUsername("chunithm", "owner", "friend")).resolves.toMatchObject({
    access: "public", profileShowPlayCounts: true, profileShowEvents: false,
  });
});

it("looks up friendship only when being a friend changes what the visitor sees", async () => {
  proxy.respond([PUBLIC]);
  await resolvePublicUserByUsername("chunithm", "owner", "visitor");
  expect(friends.areFriends).not.toHaveBeenCalled();
});
