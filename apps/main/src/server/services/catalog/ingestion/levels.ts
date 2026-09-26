export type CatalogLevelPolicy = {
  toPrecise: (level: string) => number;
  mismatchUpperOffset?: (minimum: number) => number;
};

export function fillMissingCatalogLevel(
  level: string,
  levelPrecise: number | undefined,
  policy: CatalogLevelPolicy,
): { levelPrecise: number; estimated: boolean; reason?: "missing" | "mismatched" } {
  const minimum = policy.toPrecise(level);
  const mismatched = levelPrecise !== undefined && policy.mismatchUpperOffset !== undefined
    && (levelPrecise < minimum || levelPrecise > minimum + policy.mismatchUpperOffset(minimum));
  if (levelPrecise !== undefined && !mismatched) return { levelPrecise, estimated: false };
  return { levelPrecise: minimum, estimated: true, reason: mismatched ? "mismatched" : "missing" };
}
