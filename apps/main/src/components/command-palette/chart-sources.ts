"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Calculator, Download, Filter, LogIn, Shuffle } from "lucide-react";
import { toast } from "sonner";
import { useGame } from "@/components/providers/game-provider";
import { useAuthDialog } from "@/components/auth/auth-dialog-provider";
import type { UniqueSong, UniqueSongDifficulty } from "@/components/db/songs/types";
import { GAME_CODES, codeOf } from "@/lib/games/codes";
import type { Region } from "@/lib/games/ids";
import { supportsGameFeature } from "@/lib/games/frontend";
import { formatGameRating, formatGameScore, getGameDifficulty, getGameStatusLabels, getGrade, parseGameScore } from "@/lib/games/presentation";
import { getGame } from "@/lib/games/registry";
import { getCurrentVersion } from "@/lib/games/versions";
import type { GamePlayerScore } from "@/lib/games/player-view";
import { matchesChartQuery, needsScores, parseChartQuery, parseRatingQuery } from "@/lib/search/chart-query";
import { useSession } from "@/lib/auth-client";
import { trpc } from "@/lib/trpc-client";
import type { PaletteItem } from "./types";

const CHART_RESULTS = 8;

type ChartMatch = { song: UniqueSong; chart: UniqueSongDifficulty; difficultyCode: number; score: GamePlayerScore | null };

function chartKey(songName: string, artist: string, typeCode: number, difficultyCode: number): string {
  return `${songName}\u0000${artist}\u0000${typeCode}\u0000${difficultyCode}`;
}

/**
 * Charts for a query made only of filters, such as `14+ master !fc`: the catalog's charts, narrowed by the viewer's
 * latest scores when the query asks about them. `random` picks one of the matches instead.
 */
export function useChartResults({ open, text, catalog, region }: { open: boolean; text: string; catalog: UniqueSong[] | undefined; region: Region | null }) {
  const t = useTranslations("commandPalette");
  const game = useGame();
  const { data: session } = useSession();
  const { openAuthDialog } = useAuthDialog();
  const [seed, setSeed] = useState(Math.random);

  const query = useMemo(() => parseChartQuery(game.id, text), [game.id, text]);
  const scored = !!query && needsScores(query);
  const canScore = !!session?.user && supportsGameFeature(game, "scores") && region !== null;
  const enabled = open && scored && canScore;
  const { data: snapshots, isLoading: snapshotsLoading, isSuccess: snapshotsLoaded } = trpc.user.getSnapshots.useQuery({ game: game.id, region: region ?? game.regions[0] }, {
    enabled,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
  const latest = snapshots?.[0]?.publicId ?? null;
  const { data: snapshotData, isLoading: snapshotLoading } = trpc.user.getSnapshotData.useQuery({ game: game.id, region: region ?? game.regions[0], snapshotId: latest ?? "" }, {
    enabled: enabled && latest !== null,
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const matches = useMemo((): ChartMatch[] | null => {
    if (!query || !catalog || (scored && !snapshotData)) return null;
    const scores = new Map((snapshotData?.songs ?? []).map(score => [chartKey(score.songName, score.artist, score.typeCode, score.difficultyCode), score]));
    const found: ChartMatch[] = [];
    for (const song of catalog) {
      const typeCode = codeOf(game.id, "chartType", song.type);
      for (const chart of song.difficulties) {
        const difficultyCode = codeOf(game.id, "difficulty", chart.difficulty);
        const score = scores.get(chartKey(song.songName, song.artist, typeCode, difficultyCode)) ?? null;
        if (matchesChartQuery(query, { level: chart.level, levelPrecise: chart.levelPrecise, difficultyCode, typeCode }, score)) {
          found.push({ song, chart, difficultyCode, score });
        }
      }
    }
    return found.sort((a, b) => b.chart.levelPrecise - a.chart.levelPrecise || (b.score?.scoreValue ?? 0) - (a.score?.scoreValue ?? 0));
  }, [query, catalog, scored, snapshotData, game.id]);

  const items = useMemo((): PaletteItem[] => {
    if (!query) return [];
    if (scored && !canScore) {
      return session?.user ? [] : [{ id: "charts:sign-in", group: "charts", title: t("charts.signIn"), icon: LogIn, perform: () => openAuthDialog() }];
    }
    if (snapshotsLoaded && snapshots.length === 0 && scored) {
      return [{ id: "charts:no-scores", group: "charts", title: t("charts.noScores"), icon: Download, href: "/settings/fetch" }];
    }
    if (!matches || matches.length === 0) return [];
    const toItem = ({ song, chart, difficultyCode, score }: ChartMatch): PaletteItem => {
      const difficulty = getGameDifficulty(game.id, difficultyCode);
      const result = score
        ? [formatGameScore(game.id, score.scoreValue, { precision: "compact" }), ...getGameStatusLabels(game.id, score)].join(" ")
        : scored ? t("charts.unplayed") : null;
      return {
        id: `chart:${song.slug}:${chart.difficulty}`,
        group: "charts",
        title: song.songName,
        subtitle: [`${difficulty.label} ${chart.level}`, result].filter(Boolean).join(" · "),
        cover: song.cover,
        href: `/db/songs/${encodeURIComponent(song.slug)}`,
        song,
        chart: chart.difficulty,
        remember: true,
      };
    };
    if (query.random) {
      const pick = matches[Math.floor(seed * matches.length) % matches.length];
      return [toItem(pick), { id: "charts:reroll", group: "charts", title: t("charts.reroll"), icon: Shuffle, keepOpen: true, perform: () => setSeed(Math.random()) }];
    }
    return matches.slice(0, CHART_RESULTS).map(toItem);
  }, [query, scored, canScore, session?.user, snapshotsLoaded, snapshots, matches, seed, game.id, t, openAuthDialog]);

  return {
    query,
    items,
    count: query?.random ? null : matches?.length ?? null,
    loading: enabled && (snapshotsLoading || snapshotLoading),
  };
}

/** `14.7 100.5` reads as a chart constant and a score, and answers with the chart rating. */
export function useCalculatorItem(text: string, region: Region | null): PaletteItem | null {
  const t = useTranslations("commandPalette");
  const game = useGame();
  return useMemo(() => {
    const parsed = parseRatingQuery(text);
    if (!parsed || !supportsGameFeature(game, "rating")) return null;
    const scoreValue = parseGameScore(game.id, parsed.score);
    if (scoreValue === null) return null;
    const { rating } = getGame(game.id);
    const difficultyCode = (GAME_CODES[game.id].difficulty as readonly string[]).findIndex((_, code) => rating.isRated(code));
    const version = getCurrentVersion(game.id, region ?? game.regions[0]);
    const value = formatGameRating(game.id, rating.chartRating({ scoreValue, levelPrecise: parsed.levelPrecise, difficultyCode, comboStatus: 0 }, version));
    return {
      id: "calculator",
      group: "calculator",
      title: t("calculator.result", { rating: value }),
      subtitle: [(parsed.levelPrecise / 10).toFixed(1), formatGameScore(game.id, scoreValue), getGrade(game.id, scoreValue)].join(" · "),
      icon: Calculator,
      perform: () => {
        void navigator.clipboard.writeText(value).then(() => toast.success(t("calculator.copied", { rating: value })), () => undefined);
      },
    };
  }, [text, region, game, t]);
}

/** Example queries shown before anything is typed, each filling the search box when chosen. */
export function useTipItems(setQuery: (query: string) => void): PaletteItem[] {
  const t = useTranslations("commandPalette");
  const game = useGame();
  const { data: session } = useSession();
  return useMemo(() => {
    const top = getGame(game.id).presentation.grades.find(grade => grade.benchmark)!;
    const examples = [
      session?.user && supportsGameFeature(game, "scores") ? { query: "13+ !fc", label: t("tips.filters"), icon: Filter } : null,
      { query: "random 13+", label: t("tips.random"), icon: Shuffle },
      supportsGameFeature(game, "rating") ? { query: `13.7 ${formatGameScore(game.id, top.min)}`, label: t("tips.calculator"), icon: Calculator } : null,
    ];
    return examples
      .filter(example => example !== null)
      .filter(example => parseChartQuery(game.id, example.query) || parseRatingQuery(example.query))
      .map(example => ({
        id: `tip:${example.query}`,
        group: "tips" as const,
        title: example.query,
        subtitle: example.label,
        icon: example.icon,
        keepOpen: true,
        perform: () => setQuery(example.query),
      }));
  }, [game, session?.user, t, setQuery]);
}
