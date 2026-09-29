import { z } from "zod";
import { MAIMAI_PLATE_DIFFICULTIES, MAIMAI_PLATE_TYPES } from "@/lib/games/maimai/plates";
import type { RecentPlay } from "@/server/queries/recents";
import { PLAYLOG_DESCRIPTION, regionSchema, songScore, type GameApiDetails } from "./common";

export const plateSelection = z.object({
  version: z.string().describe("Added version of the charts to evaluate (e.g. \"13\")."),
  difficulty: z.enum(MAIMAI_PLATE_DIFFICULTIES).describe("Chart difficulty to evaluate plate completion against."),
  plateType: z
    .enum(MAIMAI_PLATE_TYPES)
    .describe("Which plate to evaluate: kiwami (FC), shou (SSS), shin (AP), maimai (FDX)."),
});

export const plateQuery = plateSelection.extend({ region: regionSchema });

export const plateEntry = songScore.pick({
  songId: true,
  songName: true,
  artist: true,
  cover: true,
  difficulty: true,
  levelPrecise: true,
  type: true,
  scoreValue: true,
  secondaryScore: true,
  comboStatus: true,
  syncStatus: true,
  clearStatus: true,
});

const noteCount = z.number().int().nullable();

export const maimaiSongDetails = z.object({
  game: z.literal("maimai"),
  noteCounts: z
    .object({ tap: noteCount, hold: noteCount, slide: noteCount, touch: noteCount, break: noteCount })
    .describe("Notes per kind. Null where the catalog has no count."),
});

const judgments = z.object({
  cPerfect: z.number().int(),
  perfect: z.number().int(),
  great: z.number().int(),
  good: z.number().int(),
  miss: z.number().int(),
});

const maimaiPlaylog = z.object({
  venue: z.string().nullable(),
  combo: z.number().int(),
  maxCombo: z.number().int(),
  syncScore: z.number().int().nullable(),
  maxSyncScore: z.number().int().nullable(),
  rating: z.number().int(),
  ratingChange: z.number().int(),
  fast: z.number().int(),
  late: z.number().int(),
  notes: z.object({ tap: judgments, hold: judgments, slide: judgments, touch: judgments, break: judgments }),
});

export const maimaiRecentDetails = z.object({
  game: z.literal("maimai"),
  maxDxScore: z.number().int().describe("The chart's maximum DX score. 0 when unknown."),
  playlog: maimaiPlaylog.nullable().describe(PLAYLOG_DESCRIPTION),
});

export const maimaiSnapshotDetails = z.object({
  game: z.literal("maimai"),
  courseRankUrl: z.string().nullable(),
  classRankUrl: z.string().nullable(),
  stars: z.number().int().nullable(),
});

/** A column of the playlog detail row. The row's columns are NOT NULL, so null only means the row is missing. */
function detail(value: number | null): number {
  if (value === null) throw new Error("maimai playlog detail row is incomplete");
  return value;
}

function playlog(play: RecentPlay): z.input<typeof maimaiPlaylog> | null {
  if (play.tapCPerfect === null) return null;
  return {
    venue: play.venue,
    combo: detail(play.combo),
    maxCombo: detail(play.maxCombo),
    syncScore: play.syncScore,
    maxSyncScore: play.maxSyncScore,
    rating: detail(play.rating),
    ratingChange: detail(play.ratingChange),
    fast: detail(play.fastCount),
    late: detail(play.lateCount),
    notes: {
      tap: { cPerfect: play.tapCPerfect, perfect: detail(play.tapPerfect), great: detail(play.tapGreat), good: detail(play.tapGood), miss: detail(play.tapMiss) },
      hold: { cPerfect: detail(play.holdCPerfect), perfect: detail(play.holdPerfect), great: detail(play.holdGreat), good: detail(play.holdGood), miss: detail(play.holdMiss) },
      slide: { cPerfect: detail(play.slideCPerfect), perfect: detail(play.slidePerfect), great: detail(play.slideGreat), good: detail(play.slideGood), miss: detail(play.slideMiss) },
      touch: { cPerfect: detail(play.touchCPerfect), perfect: detail(play.touchPerfect), great: detail(play.touchGreat), good: detail(play.touchGood), miss: detail(play.touchMiss) },
      break: { cPerfect: detail(play.breakCPerfect), perfect: detail(play.breakPerfect), great: detail(play.breakGreat), good: detail(play.breakGood), miss: detail(play.breakMiss) },
    },
  };
}

export const maimaiApiDetails = {
  song: (chart): z.input<typeof maimaiSongDetails> => ({
    game: "maimai",
    noteCounts: { tap: chart.tapCount, hold: chart.holdCount, slide: chart.slideCount, touch: chart.touchCount, break: chart.breakCount },
  }),
  recent: (play, withPlaylog): z.input<typeof maimaiRecentDetails> => ({
    game: "maimai",
    maxDxScore: play.maxDxScore,
    playlog: withPlaylog ? playlog(play) : null,
  }),
  snapshot: ({ courseRankUrl, classRankUrl, stars }): z.input<typeof maimaiSnapshotDetails> => ({ game: "maimai", courseRankUrl, classRankUrl, stars }),
} satisfies GameApiDetails<"maimai">;
