import { Tabs, TabsList, TabsContent, TabsContents, TabsTrigger } from "@/components/animate-ui/components/radix/tabs";
import { ResponsiveDialogTitle } from "@tomomai/ui";
import type { Region } from "@/lib/games/ids";
import { cn } from "@/lib/utils";
import { Fragment, useState } from "react";
import { SongExtendedIdentified, UserScore } from "./types";
import { useTranslations } from "next-intl";
import { useGame, usePresentation } from "@/components/providers/game-provider";
import { getGame } from "@/lib/games/registry";
import { codeOf } from "@/lib/games/codes";
import { ChartLevel } from "@/components/games/chart-level";
import { formatEstimated, formatGameScore, formatGameRating, getGameDifficulty, getGameRankingBuckets, getGameScoreBenchmarks } from "@/lib/games/presentation";
import { GAME_UI } from "@/components/games/registry";
import { useFormatter } from "next-intl";
import { ScoreHistoryChart } from "./score-history-chart";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useSongInsights } from "./song-insights";
import { playerRatingGain, ratingBucketFloor, ratingBucketOf, type RatingStanding } from "@/lib/games/rating-standing";


/** Where a chart sits in the viewer's rating selection, and what it takes to raise it. */
function RatingStandingNote({ chart, standing }: { chart: SongExtendedIdentified; standing: RatingStanding }) {
  const t = useTranslations();
  const game = useGame().id;
  const placement = standing.charts[chart.difficulty];
  const bucketKey = placement?.bucket ?? ratingBucketOf(game, chart.addedVersion, standing.gameVersion);
  const bucket = getGameRankingBuckets(game).find(entry => entry.key === bucketKey)!;
  const bucketTitle = t(`dataContent.rankingBucket.${bucket.key}`, { size: bucket.size });
  const floor = ratingBucketFloor(game, standing, bucketKey);
  return <p className="text-xs text-muted-foreground">
    {placement
      ? t("db.songs.detail.standing.inBest", { rank: placement.index + 1, bucket: bucketTitle })
      : floor !== null
        ? t("db.songs.detail.standing.toEnter", { bucket: bucketTitle, rating: formatGameRating(game, floor) })
        : t("db.songs.detail.standing.room", { bucket: bucketTitle })}
  </p>;
}

function SongChartDialogGrid({ chart, score, standing }: { chart: SongExtendedIdentified; score?: UserScore; standing?: RatingStanding }) {
  const t = useTranslations();
  const game = useGame();
  const { scoreLabel } = usePresentation();
  const benchmarks = getGameScoreBenchmarks(game.id);
  const { rating: gameRating } = getGame(game.id);
  const difficultyCode = codeOf(game.id, "difficulty", chart.difficulty);
  const chartRating = (scoreValue: number, comboStatus = 0) => gameRating.chartRating({ scoreValue, levelPrecise: chart.levelPrecise, difficultyCode, comboStatus }, chart.gameVersion);
  const rating = (scoreValue: number, comboStatus = 0) => formatEstimated(formatGameRating(game.id, chartRating(scoreValue, comboStatus)), chart.levelPreciseEstimated);
  const gains = standing && gameRating.isRated(difficultyCode) ? standing : null;
  const placement = gains ? {
    bucket: gains.charts[chart.difficulty]?.bucket ?? ratingBucketOf(game.id, chart.addedVersion, gains.gameVersion),
    index: gains.charts[chart.difficulty]?.index ?? null,
  } : null;
  const gain = (scoreValue: number, comboStatus = 0) => {
    if (!gains || !placement) return null;
    // Rated at the snapshot's version, like the ratings it is compared with, since bonuses differ between versions.
    const candidate = gameRating.chartRating({ scoreValue, levelPrecise: chart.levelPrecise, difficultyCode, comboStatus }, gains.gameVersion);
    const value = playerRatingGain(game.id, gains, placement, candidate);
    return value > 0 ? `+${formatGameRating(game.id, value)}` : "—";
  };
  const { ChartInsights } = GAME_UI[game.id];
  const format = useFormatter();
  const insights = useSongInsights();
  const history = insights?.history[chart.region]?.[chart.difficulty] ?? [];
  const wide = useMediaQuery("(min-width: 1024px)");
  const gainCell = (scoreValue: number, comboStatus = 0) => gains && <span className="py-1.5 px-3 text-xs border-b border-l font-medium tabular-nums text-primary">{gain(scoreValue, comboStatus)}</span>;
  const table = <div className="space-y-2">
    {gains && <RatingStandingNote chart={chart} standing={gains} />}
    <div className={cn("grid rounded-md overflow-hidden border", gains ? "grid-cols-[minmax(100px,5fr)_minmax(80px,1fr)_minmax(80px,1fr)]" : "grid-cols-[minmax(100px,5fr)_minmax(100px,1fr)]")}>
      <div className="contents text-xs bg-accent/50 font-medium text-muted-foreground">
        <div className="py-1.5 px-3 border-b border-r">{t(`db.songs.detail.${scoreLabel}`)}</div>
        <div className="py-1.5 px-3 border-b">{t("db.songs.detail.rating")}</div>
        {gains && <div className="py-1.5 px-3 border-b border-l whitespace-nowrap">{t("db.songs.detail.ratingGain")}</div>}
      </div>
      {gameRating.bonuses(chart.gameVersion).map(bonus => <div key={bonus.label} className="contents">
        <span className="py-1.5 px-3 text-xs border-r border-b">{bonus.label}</span>
        <span className="py-1.5 px-3 text-xs border-b font-medium">{rating(bonus.scoreValue, bonus.comboStatuses[0])}</span>
        {gainCell(bonus.scoreValue, bonus.comboStatuses[0])}
      </div>)}
      {benchmarks.map((benchmark, index) => <Fragment key={benchmark.scoreValue}>
        {score && score.scoreValue > benchmark.scoreValue && (index === 0 || benchmarks[index - 1].scoreValue >= score.scoreValue) && <div className="contents *:bg-primary/80 text-primary-foreground">
          <span className="py-1.5 px-3 text-xs border-r border-b font-semibold flex gap-1.5 flex-wrap"><span>{t("db.songs.detail.yourScore")}</span><span>({formatGameScore(game.id, score.scoreValue)})</span></span>
          <span className="py-1.5 px-3 text-xs border-b font-medium">{rating(score.scoreValue, score.comboStatus)}</span>
          {gains && <span className="py-1.5 px-3 text-xs border-b border-l" />}
        </div>}
        <div className="contents">
          <span className="py-1.5 px-3 text-xs border-r border-b">{benchmark.label}<span className="ml-1.5 text-xs text-muted-foreground">({formatGameScore(game.id, benchmark.scoreValue)})</span></span>
          <span className="py-1.5 px-3 text-xs border-b font-medium">{rating(benchmark.scoreValue)}</span>
          {gainCell(benchmark.scoreValue)}
        </div>
      </Fragment>)}
    </div>
  </div>;
  const historyView = history.length > 0 && <div className="space-y-2">
    {wide && <div className="text-xs font-medium">{t("db.songs.detail.history.title")}</div>}
    <ScoreHistoryChart points={history} label={t("db.songs.detail.history.title")} />
    {history.length === 1 && <p className="text-xs text-muted-foreground">{t("db.songs.detail.history.unchanged", { date: format.dateTime(history[0].fetchedAt, { year: "numeric", month: "short", day: "numeric" }) })}</p>}
  </div>;
  // ChartInsights compares against players around the viewer's rating, so it renders nothing without one.
  const insightsView = ChartInsights && (standing?.playerRating ?? 0) > 0 && <ChartInsights chart={chart} score={score} playerRating={standing?.playerRating ?? null} regionCharts={insights?.regionCharts[chart.region] ?? [{ chart, score }]} />;

  if (wide) {
    return <div className="flex items-start gap-5">
      <div className="w-[24rem] shrink-0">{table}</div>
      {(historyView || insightsView) && <div className={cn("w-[24rem] shrink-0 space-y-3", historyView && insightsView ? "sticky top-0" : "self-center", "[&:not(:has(>section:not(:empty)))]:hidden")}>
        {historyView && <section className="rounded-xl border bg-muted/30 p-4">{historyView}</section>}
        {insightsView && <section className="rounded-xl border bg-muted/30 p-4 empty:hidden">{insightsView}</section>}
      </div>}
    </div>;
  }
  const sections = [
    { key: "rating", label: t("db.songs.detail.sections.rating"), view: table },
    historyView && { key: "history", label: t("db.songs.detail.sections.history"), view: historyView },
    insightsView && {
      key: "compare",
      label: t("db.songs.detail.sections.compare"),
      view: <div data-empty={t("db.songs.detail.sections.compareEmpty")} className="empty:py-10 empty:text-center empty:text-sm empty:text-muted-foreground empty:before:content-[attr(data-empty)]">{insightsView}</div>,
    },
  ].filter(section => !!section);
  return <Tabs defaultValue="rating">
    <TabsList className={cn("grid w-full", { 2: "grid-cols-2", 3: "grid-cols-3" }[sections.length], sections.length <= 1 && "hidden")}>
      {sections.map(section => <TabsTrigger key={section.key} value={section.key}>{section.label}</TabsTrigger>)}
    </TabsList>
    <TabsContents>{sections.map(section => <TabsContent key={section.key} value={section.key} className="pt-2">{section.view}</TabsContent>)}</TabsContents>
  </Tabs>;
}

export function SongChartDialogContent({ charts, scores, standings }: { charts: SongExtendedIdentified[]; scores: Partial<Record<Region, UserScore>>; standings?: Partial<Record<Region, RatingStanding>> }) {
  const t = useTranslations();
  const game = useGame();
  const regionsWithScores = Object.keys(scores).filter(region => scores[region as Region] !== undefined);
  const [region, setRegion] = useState<Region>((regionsWithScores[0] ?? charts[0].region) as Region);
  const chart = charts.find(c => c.region === region)!;
  const difficulty = getGameDifficulty(game.id, codeOf(game.id, "difficulty", chart.difficulty));
  return <Tabs value={region} onValueChange={value => setRegion(value as Region)} className="gap-3">
    <div className="flex items-center justify-between gap-3 md:pr-8">
      <ResponsiveDialogTitle>
        <span className={cn("font-bold mr-2", difficulty.classes.text)}>{difficulty.label}</span>
        <ChartLevel chart={chart} variant="split" />
      </ResponsiveDialogTitle>
      {charts.length > 1 && <TabsList className="h-8 shrink-0">
        {charts.map(c => <TabsTrigger key={c.region} value={c.region} className="px-3 text-xs">{t(`regions.short.${c.region}`)}</TabsTrigger>)}
      </TabsList>}
    </div>
    <TabsContents>{charts.map(c => <TabsContent key={c.region} value={c.region}><SongChartDialogGrid chart={c} score={scores[c.region]} standing={standings?.[c.region]} /></TabsContent>)}</TabsContents>
  </Tabs>;
}
