import { z } from "zod";

export const CHUNITHM_NOTE_KINDS = ["tap", "hold", "slide", "air", "flick"] as const;
export type ChunithmNoteKind = (typeof CHUNITHM_NOTE_KINDS)[number];
type ChunithmNoteCounts = Record<ChunithmNoteKind, number | null>;

const storedNoteCounts = z.object({
  otogeDb: z.object({
    noteCounts: z.partialRecord(z.enum(CHUNITHM_NOTE_KINDS), z.number().int().nonnegative()),
  }),
});

/** The note counts per kind that the otoge-db catalog source keeps in a chart's metadata. A kind the source leaves out is null. */
export function readChunithmNoteCounts(metadata: unknown): ChunithmNoteCounts {
  const counts = storedNoteCounts.safeParse(metadata).data?.otogeDb.noteCounts ?? {};
  return {
    tap: counts.tap ?? null,
    hold: counts.hold ?? null,
    slide: counts.slide ?? null,
    air: counts.air ?? null,
    flick: counts.flick ?? null,
  };
}
