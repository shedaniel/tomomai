"use client";

import { useGame } from "@/components/providers/game-provider";
import { codeOf } from "@/lib/games/codes";
import { formatEstimated, formatGameLevel, getGameDifficulty } from "@/lib/games/presentation";

type CatalogChartLevel = {
  difficulty: string;
  levelPrecise: number;
  levelPreciseEstimated?: boolean;
};

/** A catalog chart's level: "≈14.7" when compact, or the published level with its decimal beside it when split. */
export function ChartLevel(props:
  | { chart: CatalogChartLevel; variant?: "compact" }
  | { chart: CatalogChartLevel & { level: string }; variant: "split" }) {
  const game = useGame().id;
  const { chart } = props;
  const difficultyCode = codeOf(game, "difficulty", chart.difficulty);

  if (props.variant !== "split") {
    return formatEstimated(formatGameLevel(game, chart.levelPrecise, difficultyCode), chart.levelPreciseEstimated);
  }

  const decimal = getGameDifficulty(game, difficultyCode).unknownDecimal ? "?" : chart.levelPrecise % 10;
  return (
    <>
      <span className="text-lg font-bold tabular-nums">{formatEstimated(props.chart.level, chart.levelPreciseEstimated)}</span>
      <span className="text-xs">.{decimal}</span>
    </>
  );
}
