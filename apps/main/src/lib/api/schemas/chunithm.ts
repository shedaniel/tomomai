import { z } from "zod";
import { readChunithmNoteCounts } from "@/lib/games/chunithm/note-counts";
import { PLAYLOG_DESCRIPTION, type GameApiDetails } from "./common";

const noteCount = z.number().int().nullable();

export const chunithmSongDetails = z.object({
  game: z.literal("chunithm"),
  noteCounts: z
    .object({ tap: noteCount, hold: noteCount, slide: noteCount, air: noteCount, flick: noteCount })
    .describe("Notes per kind. Null where the catalog has no count."),
});

const count = z.number().int();
const percentage = z.number();

const chunithmPlaylog = z.object({
  maxCombo: count,
  judgments: z.object({ justiceCritical: count, justice: count, attack: count, miss: count }),
  notePercentages: z
    .object({ tap: percentage, hold: percentage, slide: percentage, air: percentage, flick: percentage })
    .describe("Accuracy per note kind, in percent."),
});

export const chunithmRecentDetails = z.object({
  game: z.literal("chunithm"),
  playlog: chunithmPlaylog.nullable().describe(PLAYLOG_DESCRIPTION),
});

export const chunithmSnapshotDetails = z.object({
  game: z.literal("chunithm"),
});

export const chunithmApiDetails = {
  song: (chart): z.input<typeof chunithmSongDetails> => ({ game: "chunithm", noteCounts: readChunithmNoteCounts(chart.metadata) }),
  recent: (play, withPlaylog): z.input<typeof chunithmRecentDetails> => ({
    game: "chunithm",
    playlog: withPlaylog ? play.chunithmDetails : null,
  }),
  snapshot: (): z.input<typeof chunithmSnapshotDetails> => ({ game: "chunithm" }),
} satisfies GameApiDetails<"chunithm">;
