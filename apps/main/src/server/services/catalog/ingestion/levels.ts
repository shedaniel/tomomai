import { getLogger } from "@/lib/request-logger";
import { catalogChartKey, requireCatalogValue } from "./normalize-charts";
import { value } from "./types";
import type { CatalogStage } from "./runner";

/** How a game turns a display level into a constant when its sources give none. */
export type CatalogLevelPolicy = {
  toPrecise: (level: string) => number;
  /** How far above the display level's minimum a source constant may sit. Without it, source constants are never repaired. */
  mismatchUpperOffset?: (minimum: number) => number;
};

/** A display level such as `14+` as a constant ×10, with the game's `+` offset. */
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

/** The last stage of every game: estimates missing or implausible constants and records which ones were estimated. */
export function fillMissingStage(policy: CatalogLevelPolicy): CatalogStage {
  return {
    name: "Fill Missing",
    async run(context, charts) {
      let missing = 0, mismatched = 0;
      const result = charts.map(chart => {
        const songKey = catalogChartKey(chart);
        const level = requireCatalogValue(value(chart.level), "level", songKey, context.log);
        const filled = fillMissingCatalogLevel(level, value(chart.levelPrecise), policy);
        if (filled.reason === "missing") {
          missing++;
          context.log.warn({ songKey }, "Level precise is missing");
        }
        if (filled.reason === "mismatched") {
          mismatched++;
          context.log.warn({ songKey }, "Level precise is mismatched");
        }
        const metadata = value(chart.metadata);
        return {
          ...chart,
          levelPrecise: filled.reason ? filled.levelPrecise : chart.levelPrecise,
          metadata: { ...metadata, levelPreciseEstimated: filled.estimated || metadata?.levelPreciseEstimated === true },
        };
      });
      context.notice.addDetail(`${missing} missing, ${mismatched} mismatched level precise values fixed`);
      return result;
    },
  };
}
