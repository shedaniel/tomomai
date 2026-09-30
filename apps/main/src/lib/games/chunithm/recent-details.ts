import { z } from "zod";

const count = z.number().int().nonnegative();
const percentage = z.number().nonnegative();

export const chunithmPlaylogSchema = z.object({
  maxCombo: count,
  judgments: z.object({
    justiceCritical: count,
    justice: count,
    attack: count,
    miss: count,
  }),
  notePercentages: z.object({
    tap: percentage,
    hold: percentage,
    slide: percentage,
    air: percentage,
    flick: percentage,
  }).describe("Accuracy per note kind, in percent."),
});

export type ChunithmPlaylog = z.infer<typeof chunithmPlaylogSchema>;

export type ChunithmRecentDetails = {
  playlog: ChunithmPlaylog | null;
};

/** Reads the playlog a CHUNITHM recent play stores in its metadata, or null when none was fetched. */
export function decodeChunithmPlaylog(metadata: unknown): ChunithmPlaylog | null {
  const parsed = chunithmPlaylogSchema.safeParse(metadata);
  return parsed.success ? parsed.data : null;
}
