import type { GameDefinition } from "../types";
import { chunithmPresentation } from "./presentation";
import { CHUNITHM_BUCKET_SIZES, chunithmChartRating, chunithmPlayerRating, isChunithmNewChart, isChunithmRatedChart } from "./rating";
import { chunithmVersionTable } from "./versions";

export const chunithmDefinition = {
  id: "chunithm",
  brand: {
    productName: "tomochu",
    japaneseName: "ともチュウ",
    displayName: "CHUNITHM",
    netName: "CHUNITHM-NET",
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
  presentation: chunithmPresentation,
  catalogSections: ["songs"],
  fetchStages: [
    "login",
    "player_data",
    "song_data:basic",
    "song_data:advanced",
    "song_data:expert",
    "song_data:master",
    "song_data:ultima",
    "recent_songs",
  ],
  fetch: { cookieLogin: { region: "intl" } },
} satisfies GameDefinition;
