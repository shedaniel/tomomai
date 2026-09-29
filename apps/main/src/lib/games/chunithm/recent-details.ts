import { z } from "zod";

const count = z.number().int().nonnegative();
const percentage = z.number().nonnegative();

export const chunithmRecentDetailsSchema = z.object({
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

export type ChunithmRecentDetails = z.infer<typeof chunithmRecentDetailsSchema>;

export function decodeChunithmRecentDetails(metadata: unknown): ChunithmRecentDetails | null {
  const parsed = chunithmRecentDetailsSchema.safeParse(metadata);
  return parsed.success ? parsed.data : null;
}
