export type CatalogLevelPolicy = {
  plusOffset: number;
  mismatchUpperOffset?: (minimum: number) => number;
};

export function fillMissingCatalogLevel(
  level: string | undefined,
  levelPrecise: number | null | undefined,
  policy: CatalogLevelPolicy,
): { levelPrecise: number | null; estimated: boolean; reason: "missing" | "mismatched" | null } {
  const match = level && /^(\d{1,2})(\+?)$/.exec(level.trim());
  const minimum = match && Number(match[1]) > 0
    ? Number(match[1]) * 10 + (match[2] ? policy.plusOffset : 0)
    : null;
  const current = levelPrecise != null && Number.isFinite(levelPrecise) ? levelPrecise : null;
  if (minimum === null) return { levelPrecise: current, estimated: false, reason: null };
  const mismatched = current !== null && policy.mismatchUpperOffset !== undefined
    && (current < minimum || current > minimum + policy.mismatchUpperOffset(minimum));
  if (current !== null && !mismatched) return { levelPrecise: current, estimated: false, reason: null };
  return { levelPrecise: minimum, estimated: true, reason: mismatched ? "mismatched" : "missing" };
}
