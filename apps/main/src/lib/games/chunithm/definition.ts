import { SEGA_COOKIE_LOGIN_URL } from "../sega-gateway";
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
      entryUrl: "https://chunithm-net-eng.com/mobile/",
      maintenance: { startHour: 4, endHour: 7 },
    },
    jp: {
      entryUrl: "https://new.chunithm-net.com/",
      maintenance: { startHour: 2, endHour: 7 },
    },
  },
  capabilities: ["catalog", "scores", "recents", "rankings", "rating"],
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
  fetch: { cookieLogin: { region: "intl", url: SEGA_COOKIE_LOGIN_URL } },
} satisfies GameDefinition;
