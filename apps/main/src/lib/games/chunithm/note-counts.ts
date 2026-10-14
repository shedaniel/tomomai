import type { CatalogMetadata } from "@/lib/catalog/chart-metadata";

export const CHUNITHM_NOTE_KINDS = ["tap", "hold", "slide", "air", "flick"] as const;
export type ChunithmNoteKind = (typeof CHUNITHM_NOTE_KINDS)[number];
type ChunithmNoteCounts = Record<ChunithmNoteKind, number | null>;

/** The note counts per kind that the catalog keeps in a chart's metadata. A kind the source leaves out is null. */
export function readChunithmNoteCounts(metadata: CatalogMetadata | null | undefined): ChunithmNoteCounts {
  const counts = metadata?.noteCounts ?? {};
  return {
    tap: counts.tap ?? null,
    hold: counts.hold ?? null,
    slide: counts.slide ?? null,
    air: counts.air ?? null,
    flick: counts.flick ?? null,
  };
}
