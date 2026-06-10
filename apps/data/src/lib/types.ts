// Thin shim so code ported from apps/main keeps its `@/lib/types` imports.
// Only the catalog-facing types the data service actually uses are re-exported.
export type { Region, Difficulty, Level, SongType, NoteCounts } from "@tomomai/catalog/types";
