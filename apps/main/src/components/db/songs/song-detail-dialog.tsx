import { Tabs, TabsList, TabsContent, TabsContents, TabsTrigger } from "@/components/animate-ui/components/radix/tabs";
import { ResponsiveDialogTitle } from "@tomomai/ui";
import { Region } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Fragment, useState } from "react";
import { SongDetailChart, UserScore } from "./types";
import { useTranslations } from "next-intl";
import { useGame } from "@/components/providers/game-provider";
import { getGame } from "@/lib/games/registry";
import { codeOf } from "@/lib/games/codes";
import { formatGameScore, formatGameRating, getGameDifficulty, getGameScoreBenchmarks, getGameScoreLabelKey } from "@/lib/games/presentation";

type SongExtendedIdentified = SongDetailChart & { region: Region; gameVersion: number };

function SongChartDialogGrid({ chart, score }: { chart: SongExtendedIdentified; score?: UserScore }) {
  const t = useTranslations();
  const game = useGame();
  const benchmarks = getGameScoreBenchmarks(game.id);
  const { rating: gameRating } = getGame(game.id);
  const difficultyCode = codeOf(game.id, "difficulty", chart.difficulty);
  const rating = (scoreValue: number, comboStatus = 0) => `${chart.levelPreciseEstimated ? "≈" : ""}${formatGameRating(game.id, gameRating.chartRating({ scoreValue, levelPrecise: chart.levelPrecise, difficultyCode, comboStatus }, chart.gameVersion))}`;
  return <div className="grid grid-cols-[minmax(100px,5fr)_minmax(100px,1fr)] rounded-md overflow-hidden border">
    <div className="contents text-xs bg-accent/50 font-medium text-muted-foreground">
      <div className="py-2 px-3 border-b border-r">{t(getGameScoreLabelKey(game.id))}</div>
      <div className="py-2 px-3 border-b">{t("db.songs.detail.rating")}</div>
    </div>
    {gameRating.bonuses(chart.gameVersion).map(bonus => <div key={bonus.label} className="contents">
      <span className="py-2 px-3 text-xs border-r border-b">{bonus.label}</span>
      <span className="py-2 px-3 text-xs border-b font-medium">{rating(bonus.scoreValue, bonus.comboStatuses[0])}</span>
    </div>)}
    {benchmarks.map((benchmark, index) => <Fragment key={benchmark.scoreValue}>
      {score && score.scoreValue > benchmark.scoreValue && (index === 0 || benchmarks[index - 1].scoreValue >= score.scoreValue) && <div className="contents *:bg-primary/80 text-primary-foreground">
        <span className="py-2 px-3 text-xs border-r border-b font-semibold flex gap-1.5 flex-wrap"><span>{t("db.songs.detail.yourScore")}</span><span>({formatGameScore(game.id, score.scoreValue)})</span></span>
        <span className="py-2 px-3 text-xs border-b font-medium">{rating(score.scoreValue, score.comboStatus)}</span>
      </div>}
      <div className="contents">
        <span className="py-2 px-3 text-xs border-r border-b">{benchmark.label}<span className="ml-1.5 text-xs text-muted-foreground">({formatGameScore(game.id, benchmark.scoreValue)})</span></span>
        <span className="py-2 px-3 text-xs border-b font-medium">{rating(benchmark.scoreValue)}</span>
      </div>
    </Fragment>)}
  </div>;
}

export function SongChartDialogContent({ charts, scores }: { charts: SongExtendedIdentified[]; scores: Partial<Record<Region, UserScore>> }) {
  const t = useTranslations();
  const game = useGame();
  const regionsWithScores = Object.keys(scores).filter(region => scores[region as Region] !== undefined);
  const [region, setRegion] = useState<Region>((regionsWithScores[0] ?? charts[0].region) as Region);
  const chart = charts.find(c => c.region === region)!;
  const difficulty = getGameDifficulty(game.id, codeOf(game.id, "difficulty", chart.difficulty));
  return <>
    <ResponsiveDialogTitle>
      <span className={cn("font-bold mr-2", difficulty.classes.text)}>{difficulty.label}</span>
      <span className="text-lg font-bold tabular-nums">{chart.levelPreciseEstimated ? "≈" : ""}{chart.level}</span>
      <span className="text-xs">.{difficulty.unknownDecimal ? "?" : chart.levelPrecise % 10}</span>
    </ResponsiveDialogTitle>
    <Tabs value={region} onValueChange={value => setRegion(value as Region)}>
      <TabsList className={cn("grid w-full", { 1: "grid-cols-1", 2: "grid-cols-2", 3: "grid-cols-3" }[charts.length], charts.length <= 1 && "hidden")}>
        {charts.map(c => <TabsTrigger key={c.region} value={c.region}>{t(`regions.${c.region}`)}</TabsTrigger>)}
      </TabsList>
      <TabsContents>{charts.map(c => <TabsContent key={c.region} value={c.region}><SongChartDialogGrid chart={c} score={scores[c.region]} /></TabsContent>)}</TabsContents>
    </Tabs>
  </>;
}
