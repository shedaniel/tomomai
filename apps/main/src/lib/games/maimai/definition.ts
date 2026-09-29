import type { GameDefinition } from "../types";
import { MAIMAI_CODES } from "./codes";
import { maimaiPresentation } from "./presentation";
import { MAIMAI_BUCKET_SIZES, isMaimaiNewChart, isMaimaiRatedChart, maimaiChartRating, maimaiPlayerRating, maimaiRatingBonuses } from "./rating";
import { maimaiVersionTable } from "./versions";

export const maimaiDefinition = {
  id: "maimai",
  brand: {
    productName: "tomomai",
    japaneseName: "ともマイ",
    displayName: "maimai DX",
    netName: "maimai DX NET",
  },
  sites: {
    intl: {
      origin: "https://maimaidx-eng.com",
      mobileRoot: "/maimai-mobile/",
      aime: { siteId: "maimaidxex", backUrl: "https://maimai.sega.com/" },
      maintenance: { startHour: 1, endHour: 2, weekdayEndHours: { 3: 4 } },
    },
    jp: {
      origin: "https://maimaidx.jp",
      mobileRoot: "/maimai-mobile/",
      // The host sends its leaf certificate without the GlobalSign intermediate.
      legacyTls: true,
      maintenance: { startHour: 4, endHour: 7 },
    },
    cn: {
      origin: "https://maimai.wahlap.com",
      mobileRoot: "/maimai-mobile/",
      // Unreachable from outside China, so its chain has not been verified.
      legacyTls: true,
      maintenance: { startHour: 4, endHour: 7 },
    },
  },
  capabilities: [
    "catalog",
    "catalog-stats",
    "posts",
    "scores",
    "recents",
    "albums",
    "events",
    "rankings",
    "rating",
    "rating-plate",
    "rating-distribution",
    "plates",
    "score-details",
    "stats",
    "percentiles",
    "daily-plays",
    "snapshot-copy",
    "snapshot-export",
    "image-export",
    "developer-export",
    "assistant",
    "minigames",
    "og-images",
    "community-banner",
    "reserved-accounts",
  ],
  regionCapabilityOverrides: { cn: ["albums"] },
  versions: maimaiVersionTable,
  rating: {
    bucketSizes: MAIMAI_BUCKET_SIZES,
    chartRating: maimaiChartRating,
    isNew: isMaimaiNewChart,
    isRated: isMaimaiRatedChart,
    playerRating: maimaiPlayerRating,
    bonuses: maimaiRatingBonuses,
  },
  presentation: maimaiPresentation,
  catalogSections: ["songs", "stats", "events", "posts"],
  fetchStages: [
    "login",
    "player_data",
    ...MAIMAI_CODES.difficulty.map(difficulty => `song_data:${difficulty}` as const),
    "recent_songs",
    "hidden_songs",
    "album_data",
  ],
  loginMethods: { intl: ["sega-cookie", "sega-account"], jp: ["sega-account"], cn: ["maimai-cn"] },
  // The CN catalog comes from Lxns, which needs no maimai NET login.
  catalogTokenRegions: ["intl", "jp"],
} satisfies GameDefinition;
