import type { ProfilePrivacySettings } from "./types";

/** Who may see a profile or one part of it. A part never reaches further than the profile itself. */
export const PROFILE_AUDIENCES = ["private", "friends", "public"] as const;
export type ProfileAudience = (typeof PROFILE_AUDIENCES)[number];

/** Who opens a profile that is not their own: anyone, or one of the owner's matched friends. */
export type ProfileViewer = "public" | "friend";

/** Each part of a profile with its own audience, keyed by the switch the profile views read. */
export const PROFILE_PART_AUDIENCES = {
  profileShowAllScores: "profileAllScoresAudience",
  profileShowScoreDetails: "profileScoreDetailsAudience",
  profileShowPlates: "profilePlatesAudience",
  profileShowPlayCounts: "profilePlayCountsAudience",
  profileShowEvents: "profileEventsAudience",
} as const;

export type ProfilePart = keyof typeof PROFILE_PART_AUDIENCES;
type PartAudienceKey = (typeof PROFILE_PART_AUDIENCES)[ProfilePart];

/** The stored privacy of a profile. Listing in search only applies to a public profile. */
export type ProfileAudienceSettings = { profileVisibility: ProfileAudience; profileShowInSearch: boolean }
  & Record<PartAudienceKey, ProfileAudience>;

export const DEFAULT_PROFILE_AUDIENCES: ProfileAudienceSettings = {
  profileVisibility: "friends",
  profileAllScoresAudience: "public",
  profileScoreDetailsAudience: "public",
  profilePlatesAudience: "public",
  profilePlayCountsAudience: "public",
  profileEventsAudience: "public",
  profileShowInSearch: true,
};

const RANK: Record<ProfileAudience, number> = { private: 0, friends: 1, public: 2 };
const REQUIRED: Record<ProfileViewer, number> = { friend: RANK.friends, public: RANK.public };

export function audienceIncludes(audience: ProfileAudience, viewer: ProfileViewer): boolean {
  return RANK[audience] >= REQUIRED[viewer];
}

export function capAudience(audience: ProfileAudience, cap: ProfileAudience): ProfileAudience {
  return RANK[audience] <= RANK[cap] ? audience : cap;
}

/** How a visitor sees the profile, or null when they may not open it. A friend sees a public profile as a friend. */
export function profileViewer(visibility: ProfileAudience, isFriend: boolean): ProfileViewer | null {
  if (isFriend && visibility !== "private") return "friend";
  return visibility === "public" ? "public" : null;
}

/** Whether being a friend changes what a visitor may see, so friendship is worth looking up. */
export function friendsSeeMore(settings: ProfileAudienceSettings): boolean {
  if (settings.profileVisibility !== "public") return settings.profileVisibility === "friends";
  return Object.values(PROFILE_PART_AUDIENCES).some(key => settings[key] === "friends");
}

/** What `viewer` sees of a profile, as the switches the profile views read. */
export function privacyFor(settings: ProfileAudienceSettings, viewer: ProfileViewer): ProfilePrivacySettings {
  const parts = Object.fromEntries(Object.entries(PROFILE_PART_AUDIENCES).map(([part, key]) => [
    part,
    audienceIncludes(capAudience(settings[key], settings.profileVisibility), viewer),
  ])) as Record<ProfilePart, boolean>;
  return { ...parts, profileShowInSearch: settings.profileVisibility === "public" && settings.profileShowInSearch };
}
