"use client";

import { useGameId } from "@/components/providers/game-provider";
import { getPlayerRankings, type GameSnapshotData } from "@/lib/games/player-view";
import { getGameDifficulty, getGameChartType, getGameRankingBuckets } from "@/lib/games/presentation";
import { LayoutGrid, LayoutList, Menu, Search } from "lucide-react";
import { useTranslations } from "next-intl";

import { useCallback, useMemo, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@tomomai/ui/select-friendly";
import { Input } from "@tomomai/ui";
import { motion, AnimatePresence } from "motion/react";
import { getTransition } from "@/lib/animation-constants";
import { trpc } from "@/lib/trpc-client";
import { Flags } from "@/lib/flags";
import type { PercentileMap } from "@/lib/games/maimai/percentile/types";
import { SongGridSection, SongSection } from "./bucket-section";
import { RatingDistributionChart } from "./rating-distribution-chart";
import type { RatedScore } from "./types";

type Rankings = {
  newBest: RatedScore[];
  oldBest: RatedScore[];
  newRemaining: RatedScore[];
  oldRemaining: RatedScore[];
};

const PAGE_SIZE = 50;

function SongsList({ newBest, oldBest, newRemaining, oldRemaining, displayMode, percentileMap }: Rankings & {
  displayMode: "list" | "compact";
  percentileMap?: PercentileMap;
}) {
  const t = useTranslations();
  const game = useGameId();
  const buckets = getGameRankingBuckets(game);
  const [visibleNewBest, setVisibleNewBest] = useState(Math.min(PAGE_SIZE, newBest.length));
  const [visibleOldBest, setVisibleOldBest] = useState(Math.min(PAGE_SIZE, oldBest.length));
  const [visibleNewRemaining, setVisibleNewRemaining] = useState(Math.min(PAGE_SIZE, newRemaining.length));
  const [visibleOldRemaining, setVisibleOldRemaining] = useState(Math.min(PAGE_SIZE, oldRemaining.length));

  const loadMoreNewBest = useCallback(() => {
    setVisibleNewBest(prev => Math.min(prev + PAGE_SIZE, newBest.length));
  }, [newBest.length]);

  const loadMoreOldBest = useCallback(() => {
    setVisibleOldBest(prev => Math.min(prev + PAGE_SIZE, oldBest.length));
  }, [oldBest.length]);

  const loadMoreNewRemaining = useCallback(() => {
    setVisibleNewRemaining(prev => Math.min(prev + PAGE_SIZE, newRemaining.length));
  }, [newRemaining.length]);

  const loadMoreOldRemaining = useCallback(() => {
    setVisibleOldRemaining(prev => Math.min(prev + PAGE_SIZE, oldRemaining.length));
  }, [oldRemaining.length]);

  return (
    <div className="space-y-6">
      <SongSection
        title={buckets[0].label}
        songs={newBest}
        count={`${newBest.length}/${buckets[0].size}`}
        ranked
        displayMode={displayMode}
        visibleCount={visibleNewBest}
        onLoadMore={loadMoreNewBest}
        percentileMap={percentileMap}
      />
      <SongSection
        title={buckets[1].label}
        songs={oldBest}
        count={`${oldBest.length}/${buckets[1].size}`}
        ranked
        displayMode={displayMode}
        visibleCount={visibleOldBest}
        onLoadMore={loadMoreOldBest}
        percentileMap={percentileMap}
      />
      <SongSection
        title={t('dataContent.newSongs')}
        songs={newRemaining}
        count={newRemaining.length > 0 ? `${newRemaining.length}` : undefined}
        displayMode={displayMode}
        visibleCount={visibleNewRemaining}
        onLoadMore={loadMoreNewRemaining}
        percentileMap={percentileMap}
      />
      <SongSection
        title={t('dataContent.oldSongs')}
        songs={oldRemaining}
        count={oldRemaining.length > 0 ? `${oldRemaining.length}` : undefined}
        displayMode={displayMode}
        visibleCount={visibleOldRemaining}
        onLoadMore={loadMoreOldRemaining}
        percentileMap={percentileMap}
      />
    </div>
  );
}

function SongsGrid({ newBest, oldBest, newRemaining, oldRemaining, percentileMap }: Rankings & { percentileMap?: PercentileMap }) {
  const t = useTranslations();
  const game = useGameId();
  const buckets = getGameRankingBuckets(game);
  return (
    <div className="space-y-6">
      <SongGridSection
        title={buckets[0].label}
        songs={newBest}
        count={`${newBest.length}/${buckets[0].size}`}
        percentileMap={percentileMap}
      />
      <SongGridSection
        title={buckets[1].label}
        songs={oldBest}
        count={`${oldBest.length}/${buckets[1].size}`}
        percentileMap={percentileMap}
      />
      {(newRemaining.length > 0 || oldRemaining.length > 0) && (
        <div className="text-center text-sm text-muted-foreground mt-10 mb-4">
          {t('dataContent.switchToListForAllSongs')}
        </div>
      )}
    </div>
  );
}

export function SongsCard({ selectedSnapshotData, flags }: { selectedSnapshotData: GameSnapshotData; flags?: Flags }) {
  const t = useTranslations();
  const [displayMode, setDisplayMode] = useState<"list" | "grid" | "compact">("grid");
  const [searchQuery, setSearchQuery] = useState("");

  const game = useGameId();
  const buckets = getGameRankingBuckets(game);
  const { songs, snapshot } = selectedSnapshotData;

  const rankings: Rankings = useMemo(() => {
    const { newScores, oldScores, newRemaining, oldRemaining } = getPlayerRankings(game, selectedSnapshotData);
    return { newBest: newScores, oldBest: oldScores, newRemaining, oldRemaining };
  }, [game, selectedSnapshotData]);
  const { newBest, oldBest } = rankings;

  const bestScores = useMemo(() => [...newBest, ...oldBest], [newBest, oldBest]);

  const { data: percentileData } = trpc.maimai.getChartPercentiles.useQuery(
    {
      songs: bestScores.map((s) => ({ publicSongId: s.songId, achievement: s.scoreValue })),
      userRating: snapshot.rating,
    },
    {
      enabled: game === "maimai" && !!(flags?.scorePercentile && bestScores.length > 0 && snapshot.rating > 0),
      staleTime: 1000 * 60 * 5,
    }
  );
  const percentileMap: PercentileMap = percentileData?.percentiles ?? {};

  const filteredRankings: Rankings = useMemo(() => {
    if (!searchQuery.trim()) return rankings;

    const query = searchQuery.toLowerCase().trim();
    const filterSongs = (songList: RatedScore[]) =>
      songList.filter(song =>
        song.songName.toLowerCase().includes(query) ||
        song.artist.toLowerCase().includes(query) ||
        getGameDifficulty(game, song.difficultyCode).label.toLowerCase().includes(query) ||
        (song.levelPrecise / 10).toFixed(1).toLowerCase().includes(query) ||
        getGameChartType(game, song.typeCode).label.toLowerCase().includes(query)
      );

    return {
      newBest: filterSongs(rankings.newBest),
      oldBest: filterSongs(rankings.oldBest),
      newRemaining: filterSongs(rankings.newRemaining),
      oldRemaining: filterSongs(rankings.oldRemaining),
    };
  }, [game, searchQuery, rankings]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t('dataContent.songs', { count: songs.length })}</h2>
        <Select value={displayMode} onValueChange={(value) => setDisplayMode(value as "list" | "grid" | "compact")}>
          <SelectTrigger className="w-40 h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="grid">
              <div className="flex items-center gap-2">
                <LayoutGrid className="h-4 w-4" />
                <span>{t('dataContent.displayModes.grid')}</span>
              </div>
            </SelectItem>
            <SelectItem value="list">
              <div className="flex items-center gap-2">
                <LayoutList className="h-4 w-4" />
                <span>{t('dataContent.displayModes.list')}</span>
              </div>
            </SelectItem>
            <SelectItem value="compact">
              <div className="flex items-center gap-2">
                <Menu className="h-4 w-4" />
                <span>{t('dataContent.displayModes.compact')}</span>
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <RatingDistributionChart scores={newBest} title={buckets[0].label} />
            <RatingDistributionChart scores={oldBest} title={buckets[1].label} />
          </div>

          {/* Search Field */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder={t('dataContent.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          <AnimatePresence mode="wait">
            {displayMode === "grid" ? (
              <motion.div
                key="grid"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={getTransition({ duration: 0.3, ease: [0.4, 0, 0.2, 1] })}
              >
                <SongsGrid {...filteredRankings} percentileMap={percentileMap} />
              </motion.div>
            ) : (
              <motion.div
                key="list"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={getTransition({ duration: 0.3, ease: [0.4, 0, 0.2, 1] })}
              >
                <SongsList {...filteredRankings} displayMode={displayMode} percentileMap={percentileMap} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
