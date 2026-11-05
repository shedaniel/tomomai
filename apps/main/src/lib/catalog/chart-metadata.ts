import { z } from "zod";

/** What a catalog chart records beyond its columns. An estimate flag is present only when the value is an estimate. */
export const catalogMetadataSchema = z.strictObject({
  levelPreciseEstimated: z.literal(true).optional(),
  addedVersionEstimated: z.literal(true).optional(),
  source: z.strictObject({ provider: z.literal("otoge-db"), id: z.string().min(1) }).optional(),
  /** Notes per kind, for a game whose note kinds have no columns. */
  noteCounts: z.record(z.string(), z.number().int().nonnegative()).optional(),
});

export type CatalogMetadata = z.infer<typeof catalogMetadataSchema>;

type ChartEstimates = Pick<CatalogMetadata, "levelPreciseEstimated" | "addedVersionEstimated">;

/** The catalog fields a source only estimated for a chart. Confirmed fields are left out. */
export function chartEstimates(metadata: CatalogMetadata | null | undefined): ChartEstimates {
  return {
    ...(metadata?.levelPreciseEstimated === true && { levelPreciseEstimated: true }),
    ...(metadata?.addedVersionEstimated === true && { addedVersionEstimated: true }),
  };
}
