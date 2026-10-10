import { normalizeName } from "@/lib/name-utils";
import type { GameDefinition } from "../types";
import { MAIMAI_CODES } from "./codes";
import { maimaiPresentation } from "./presentation";
import { MAIMAI_BUCKET_SIZES, isMaimaiNewChart, isMaimaiRatedChart, maimaiChartRating, maimaiPlayerRating, maimaiRatingBonuses } from "./rating";
import { maimaiRecommendationTargets } from "./recommendations";
import { maimaiVersionTable } from "./versions";

export const maimaiDefinition = {
  id: "maimai",
  brand: {
    productName: "tomomai",
    japaneseName: "ともマイ",
    displayName: "maimai DX",
    netName: "maimai DX NET",
    domain: "tomomai.lol",
    icon: "/brand/maimai/icon.png",
    logos: {
      width: 528,
      height: 132,
      sections: {
        dashboard: { light: "/brand/maimai/logo.webp", dark: "/brand/maimai/logo-dark.webp" },
        db: { light: "/brand/maimai/db-logo.webp", dark: "/brand/maimai/db-logo-dark.webp" },
      },
    },
    og: { logo: "/brand/maimai/og-logo.webp", dbLogo: "/brand/maimai/og-db-logo.webp" },
    theme: "gray-pink",
    screenshot: { src: "/posts/2026-03-26-ui-refinement/dashboard-new.webp", width: 2862, height: 1898 },
    sameAs: ["https://github.com/shedaniel/maimai-friends"],
    exampleProfile: { username: "shedaniel", region: "intl" },
    communityInviteUrl: "https://discord.gg/jZqQHr3UDq",
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
      segaId: { entryPath: "", formToken: "cookie:_t", cardSelection: { method: "GET", path: "aimeList/submit/?idx=0" } },
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
    "note-counts",
    "stats",
    "percentiles",
    "daily-plays",
    "snapshot-copy",
    "snapshot-export",
    "image-export",
    "developer-export",
    "assistant",
    "minigames",
    "community-banner",
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
  recommendations: { targets: maimaiRecommendationTargets, minPromotedChartGain: 3, highValueRatingGain: 50 },
  presentation: maimaiPresentation,
  catalogSections: [
    { id: "songs", requires: "catalog" },
    { id: "stats", requires: "catalog-stats" },
    { id: "events", requires: "events" },
    { id: "posts", requires: "posts" },
    { id: "arcades", hidden: true },
  ],
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
  normalizeCatalogTitle: normalizeName,
} satisfies GameDefinition;
