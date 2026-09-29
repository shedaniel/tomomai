import { z } from "zod";
import { readChunithmNoteCounts } from "@/lib/games/chunithm/note-counts";
import { chunithmRecentDetailsSchema } from "@/lib/games/chunithm/recent-details";
import { PLAYLOG_DESCRIPTION, type GameApiDetails } from "./common";

const noteCount = z.number().int().nullable();

export const chunithmSongDetails = z.object({
  game: z.literal("chunithm"),
  noteCounts: z
    .object({ tap: noteCount, hold: noteCount, slide: noteCount, air: noteCount, flick: noteCount })
    .describe("Notes per kind. Null where the catalog has no count."),
});

export const chunithmRecentDetails = z.object({
  game: z.literal("chunithm"),
  playlog: chunithmRecentDetailsSchema.nullable().describe(PLAYLOG_DESCRIPTION),
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
