import { GAME_CODES } from "../codes";
import type { GameDefinition } from "../types";
import { chunithmPresentation } from "./presentation";
import { CHUNITHM_BUCKET_SIZES, chunithmChartRating, chunithmPlayerRating, isChunithmNewChart, isChunithmRatedChart } from "./rating";
import { CHUNITHM_RECOMMENDATION_TARGETS } from "./recommendations";
import { chunithmVersionTable } from "./versions";

export const chunithmDefinition = {
  id: "chunithm",
  brand: {
    productName: "tomochu",
    japaneseName: "ともチュウ",
    displayName: "CHUNITHM",
    netName: "CHUNITHM-NET",
    domain: "chu.tomochu.lol",
    icon: "/brand/chunithm/icon.png",
    logos: {
      width: 528,
      height: 132,
      sections: {
        dashboard: { light: "/brand/chunithm/logo.webp", dark: "/brand/chunithm/logo-dark.webp" },
        db: { light: "/brand/chunithm/logo.webp", dark: "/brand/chunithm/logo-dark.webp" },
      },
    },
    og: { logo: "/brand/chunithm/og-logo.webp", dbLogo: "/brand/chunithm/og-logo.webp" },
    theme: "gray-gold",
    screenshot: null,
    sameAs: [],
    communityInviteUrl: "https://discord.gg/jZqQHr3UDq",
  },
  sites: {
    intl: {
      origin: "https://chunithm-net-eng.com",
      mobileRoot: "/mobile/",
      aime: { siteId: "chuniex", backUrl: "https://chunithm.sega.com/" },
      maintenance: { startHour: 4, endHour: 7 },
    },
    jp: {
      origin: "https://new.chunithm-net.com",
      mobileRoot: "/chuni-mobile/html/mobile/",
      // The JP sign-in form is on the site root, outside the mobile pages.
      segaId: { entryPath: "/", formToken: "input:token", cardSelection: { method: "POST" } },
      maintenance: { startHour: 2, endHour: 7 },
    },
  },
  capabilities: ["catalog", "scores", "recents", "rankings", "rating", "rating-distribution"],
  versions: chunithmVersionTable,
  rating: {
    bucketSizes: CHUNITHM_BUCKET_SIZES,
    chartRating: chunithmChartRating,
    isNew: isChunithmNewChart,
    isRated: isChunithmRatedChart,
    playerRating: chunithmPlayerRating,
    bonuses: () => [],
  },
  // Scaled from maimai's values: 1% of a chart rating, and a 15% chart gain spread over the 50-chart average.
  recommendations: { targets: () => CHUNITHM_RECOMMENDATION_TARGETS, minPromotedChartGain: 15, highValueRatingGain: 5 },
  presentation: chunithmPresentation,
  catalogSections: [{ id: "songs", requires: "catalog" }],
  fetchStages: [
    "login",
    "player_data",
    // WORLD'S END is not fetched until its charts have a catalog representation.
    ...GAME_CODES.chunithm.difficulty.filter(difficulty => difficulty !== "worlds-end").map(difficulty => `song_data:${difficulty}` as const),
    "recent_songs",
  ],
  loginMethods: { intl: ["sega-cookie", "sega-account"], jp: ["sega-account"] },
  fetchSubscriptions: { jp: "ゲキチュウマイ-NET" },
  catalogTokenRegions: [],
} satisfies GameDefinition;
