import { expect, it } from "vitest";
import { DEFAULT_PROFILE_AUDIENCES, friendsSeeMore, privacyFor, profileViewer } from "./profile-audience";

it("lets the public open only a public profile, and friends any profile that is not private", () => {
  expect(profileViewer("public", false)).toBe("public");
  expect(profileViewer("public", true)).toBe("friend");
  expect(profileViewer("friends", true)).toBe("friend");
  expect(profileViewer("friends", false)).toBeNull();
  expect(profileViewer("private", true)).toBeNull();
});

it("never shows a part further than the profile itself reaches", () => {
  const friendsOnly = { ...DEFAULT_PROFILE_AUDIENCES, profileVisibility: "friends" as const, profilePlatesAudience: "private" as const };
  expect(privacyFor(friendsOnly, "friend")).toMatchObject({ profileShowAllScores: true, profileShowPlates: false, profileShowInSearch: false });
  expect(privacyFor(friendsOnly, "public")).toMatchObject({ profileShowAllScores: false });
});

it("lists only a public profile", () => {
  expect(privacyFor({ ...DEFAULT_PROFILE_AUDIENCES, profileVisibility: "public" }, "public").profileShowInSearch).toBe(true);
  expect(privacyFor({ ...DEFAULT_PROFILE_AUDIENCES, profileVisibility: "public", profileShowInSearch: false }, "public").profileShowInSearch).toBe(false);
});

it("needs friendship only when a friend would see more", () => {
  expect(friendsSeeMore({ ...DEFAULT_PROFILE_AUDIENCES, profileVisibility: "public" })).toBe(false);
  expect(friendsSeeMore({ ...DEFAULT_PROFILE_AUDIENCES, profileVisibility: "public", profileEventsAudience: "friends" })).toBe(true);
  expect(friendsSeeMore({ ...DEFAULT_PROFILE_AUDIENCES, profileVisibility: "friends" })).toBe(true);
  expect(friendsSeeMore({ ...DEFAULT_PROFILE_AUDIENCES, profileVisibility: "private" })).toBe(false);
});
