import { z } from "zod";

const count = z.number().int().nonnegative();
const percentage = z.number().nonnegative();

const recentDetailsSchema = z.object({
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
  }),
});

export type ChunithmRecentDetails = z.infer<typeof recentDetailsSchema>;

export function decodeChunithmRecentDetails(metadata: unknown): ChunithmRecentDetails | null {
  const parsed = recentDetailsSchema.safeParse(metadata);
  return parsed.success ? parsed.data : null;
}
