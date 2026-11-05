import { z } from "zod";

const count = z.number().int();

const judgments = z.object({
  cPerfect: count,
  perfect: count,
  great: count,
  good: count,
  miss: count,
});

export const maimaiPlaylogSchema = z.object({
  venue: z.string().nullable(),
  combo: count,
  maxCombo: count,
  syncScore: count.nullable(),
  maxSyncScore: count.nullable(),
  rating: count,
  ratingChange: count,
  fast: count,
  late: count,
  notes: z.object({ tap: judgments, hold: judgments, slide: judgments, touch: judgments, break: judgments }),
});

export type MaimaiPlaylog = z.infer<typeof maimaiPlaylogSchema>;
type MaimaiJudgments = z.infer<typeof judgments>;
type NoteCounts = Omit<MaimaiJudgments, "cPerfect"> & { criticalPerfect: number };

export type MaimaiRecentDetails = {
  /** The chart's maximum DX score, 0 when unknown. */
  maxDxScore: number;
  playlog: MaimaiPlaylog | null;
};

/** The playlog judgments keyed as the score calculator and the render token read them. */
export function playlogNoteCounts(notes: MaimaiPlaylog["notes"]): { [K in keyof MaimaiPlaylog["notes"]]: NoteCounts } {
  const counts = ({ cPerfect, ...rest }: MaimaiJudgments): NoteCounts => ({ criticalPerfect: cPerfect, ...rest });
  return { tap: counts(notes.tap), hold: counts(notes.hold), slide: counts(notes.slide), touch: counts(notes.touch), break: counts(notes.break) };
}
