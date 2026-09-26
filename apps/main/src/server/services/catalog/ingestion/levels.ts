import { getLogger } from "@/lib/request-logger";

export type CatalogLevelPolicy = {
  toPrecise: (level: string) => number;
  mismatchUpperOffset?: (minimum: number) => number;
};

export function parseDisplayLevel(level: string, plusOffset: number): number {
  const trimmed = level.trim();
  const plus = trimmed.endsWith("+");
  const base = parseInt(plus ? trimmed.slice(0, -1) : trimmed, 10);
  if (Number.isNaN(base)) {
    getLogger().warn({ from: level }, "Invalid chart level; defaulting to 1.0");
    return 10;
  }
  return base * 10 + (plus ? plusOffset : 0);
}

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
