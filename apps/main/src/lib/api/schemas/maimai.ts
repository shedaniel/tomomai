import { z } from "zod";
import { MAIMAI_PLATE_DIFFICULTIES, MAIMAI_PLATE_TYPES } from "@/lib/games/maimai/plates";
import { maimaiPlaylogSchema } from "@/lib/games/maimai/recent-details";
import { PLAYLOG_DESCRIPTION, regionSchema, songScore, type GameApiDetails } from "./common";

export const plateSelection = z.object({
  version: z.string().describe("Added version of the charts to evaluate (e.g. \"13\")."),
  difficulty: z.enum(MAIMAI_PLATE_DIFFICULTIES).describe("Chart difficulty to evaluate plate completion against."),
  plateType: z
    .enum(MAIMAI_PLATE_TYPES)
    .describe("Which plate to evaluate: kiwami (FC), shou (SSS), shin (AP), maimai (FDX)."),
});

export const plateQuery = z.object({ region: regionSchema }).extend(plateSelection.shape);

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

export const maimaiRecentDetails = z.object({
  game: z.literal("maimai"),
  maxDxScore: z.number().int().describe("The chart's maximum DX score. 0 when unknown."),
  playlog: maimaiPlaylogSchema.nullable().describe(PLAYLOG_DESCRIPTION),
});

export const maimaiSnapshotDetails = z.object({
  game: z.literal("maimai"),
  courseRankUrl: z.string().nullable(),
  classRankUrl: z.string().nullable(),
  stars: z.number().int().nullable(),
});

export const maimaiApiDetails = {
  song: (chart): z.input<typeof maimaiSongDetails> => ({
    game: "maimai",
    noteCounts: { tap: chart.tapCount, hold: chart.holdCount, slide: chart.slideCount, touch: chart.touchCount, break: chart.breakCount },
  }),
  snapshot: ({ courseRankUrl, classRankUrl, stars }): z.input<typeof maimaiSnapshotDetails> => ({ game: "maimai", courseRankUrl, classRankUrl, stars }),
} satisfies GameApiDetails<"maimai">;
