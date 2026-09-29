import { calculateMaimaiChartRating, rankIntoBuckets } from "../rating";
import { SEGA_COOKIE_LOGIN_URL } from "../sega-gateway";
import type { GameDefinition } from "../types";
import { maimaiVersionProvider } from "./versions";

const bucketSizes = { new: 15, old: 35 };

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
      entryUrl: "https://maimaidx-eng.com/maimai-mobile/",
      maintenance: { startHour: 1, endHour: 2, weekdayEndHours: { 3: 4 } },
    },
    jp: {
      entryUrl: "https://maimaidx.jp/maimai-mobile/",
      maintenance: { startHour: 4, endHour: 7 },
    },
    cn: {
      entryUrl: "https://maimai.wahlap.com/maimai-mobile/",
      maintenance: { startHour: 4, endHour: 7 },
    },
  },
  capabilities: ["catalog", "scores", "recents", "albums", "events", "rankings", "rating", "plates", "score-details"],
  versions: maimaiVersionProvider,
  rating: {
    bucketSizes,
    chartRating({ scoreValue, levelPrecise, difficulty, comboStatus = 0 }, version) {
      return calculateMaimaiChartRating(scoreValue, levelPrecise, difficulty, comboStatus, version);
    },
    selectRankings(scores, currentVersion) {
      // From CiRCLE (12), the previous version's charts also count as new.
      const newVersionFloor = currentVersion >= 12 ? currentVersion - 1 : currentVersion;
      return rankIntoBuckets(scores, score => score.addedVersion >= newVersionFloor, bucketSizes);
    },
  },
  fetchStages: [
    "login",
    "player_data",
    "song_data:easy",
    "song_data:advanced",
    "song_data:expert",
    "song_data:master",
    "song_data:remaster",
    "song_data:utage",
    "recent_songs",
    "hidden_songs",
    "album_data",
  ],
  fetch: { cookieLogin: { region: "intl", url: SEGA_COOKIE_LOGIN_URL } },
} satisfies GameDefinition;
