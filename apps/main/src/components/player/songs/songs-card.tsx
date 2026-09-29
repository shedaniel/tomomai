"use client";

import { useGameId } from "@/components/providers/game-provider";
import { getPlayerRankings, type GameSnapshotData } from "@/lib/games/player-view";
import { getGameDifficulty, getGameChartType, getGameRankingBuckets } from "@/lib/games/presentation";
import { LayoutGrid, LayoutList, Menu, Search } from "lucide-react";
import { useTranslations } from "next-intl";

import { useCallback, useMemo, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@tomomai/ui/select-friendly";
import { Input } from "@tomomai/ui";
import { MaimaiRatingDistributionChart } from "@/components/games/maimai/rating-distribution-chart";
import { motion, AnimatePresence } from "motion/react";
import { getTransition } from "@/lib/animation-constants";
import { trpc } from "@/lib/trpc-client";
import { Flags } from "@/lib/flags";
import type { PercentileMap } from "@/lib/games/maimai/percentile/types";
import { SongGridSection, SongSection } from "./bucket-section";
import type { RatedScore } from "./types";

// Component for rendering the songs list with four sections
function SongsList({ newSongsB15, oldSongsB35, remainingNewSongs, remainingOldSongs, t, displayMode, b15Sum, b15Average, b35Sum, b35Average, percentileMap }: {
  newSongsB15: RatedScore[];
  oldSongsB35: RatedScore[];
  remainingNewSongs: RatedScore[];
  remainingOldSongs: RatedScore[];
  t: any;
  displayMode: "list" | "compact";
  b15Sum?: number;
  b15Average?: number;
  b35Sum?: number;
  b35Average?: number;
  percentileMap?: PercentileMap;
}) {
  const game = useGameId();
  const buckets = getGameRankingBuckets(game);
  const [visibleB15, setVisibleB15] = useState(Math.min(50, newSongsB15.length));
  const [visibleB35, setVisibleB35] = useState(Math.min(50, oldSongsB35.length));
  const [visibleNewRemaining, setVisibleNewRemaining] = useState(Math.min(50, remainingNewSongs.length));
  const [visibleOldRemaining, setVisibleOldRemaining] = useState(Math.min(50, remainingOldSongs.length));

  const loadMoreB15 = useCallback(() => {
    setVisibleB15(prev => Math.min(prev + 50, newSongsB15.length));
  }, [newSongsB15.length]);

  const loadMoreB35 = useCallback(() => {
    setVisibleB35(prev => Math.min(prev + 50, oldSongsB35.length));
  }, [oldSongsB35.length]);

  const loadMoreNewRemaining = useCallback(() => {
    setVisibleNewRemaining(prev => Math.min(prev + 50, remainingNewSongs.length));
  }, [remainingNewSongs.length]);

  const loadMoreOldRemaining = useCallback(() => {
    setVisibleOldRemaining(prev => Math.min(prev + 50, remainingOldSongs.length));
  }, [remainingOldSongs.length]);

  return (
    <div className="space-y-6">
      <SongSection
        title={buckets[0].label}
        songs={newSongsB15}
        count={`${newSongsB15.length}/${buckets[0].size}`}
        displayMode={displayMode}
        t={t}
        sum={b15Sum}
        average={b15Average}
        visibleCount={visibleB15}
        onLoadMore={loadMoreB15}
        percentileMap={percentileMap}
      />
      <SongSection
        title={buckets[1].label}
        songs={oldSongsB35}
        count={`${oldSongsB35.length}/${buckets[1].size}`}
        displayMode={displayMode}
        t={t}
        sum={b35Sum}
        average={b35Average}
        visibleCount={visibleB35}
        onLoadMore={loadMoreB35}
        percentileMap={percentileMap}
      />
      <SongSection
        title={t('dataContent.newSongs')}
        songs={remainingNewSongs}
        count={remainingNewSongs.length > 0 ? `${remainingNewSongs.length}` : undefined}
        displayMode={displayMode}
        t={t}
        visibleCount={visibleNewRemaining}
        onLoadMore={loadMoreNewRemaining}
        percentileMap={percentileMap}
      />
      <SongSection
        title={t('dataContent.oldSongs')}
        songs={remainingOldSongs}
        count={remainingOldSongs.length > 0 ? `${remainingOldSongs.length}` : undefined}
        displayMode={displayMode}
        t={t}
        visibleCount={visibleOldRemaining}
        onLoadMore={loadMoreOldRemaining}
        percentileMap={percentileMap}
      />
    </div>
  );
}

function SongsGrid({ newSongsB15, oldSongsB35, remainingNewSongs, remainingOldSongs, t, b15Sum, b15Average, b35Sum, b35Average, percentileMap }: { newSongsB15: RatedScore[]; oldSongsB35: RatedScore[]; remainingNewSongs: RatedScore[]; remainingOldSongs: RatedScore[]; t: any; b15Sum?: number; b15Average?: number; b35Sum?: number; b35Average?: number; percentileMap?: PercentileMap }) {
  const game = useGameId();
  const buckets = getGameRankingBuckets(game);
  return (
    <div className="space-y-6">
      <SongGridSection
        title={buckets[0].label}
        songs={newSongsB15}
        count={`${newSongsB15.length}/${buckets[0].size}`}
        t={t}
        sum={b15Sum}
        average={b15Average}
        percentileMap={percentileMap}
      />
      <SongGridSection
        title={buckets[1].label}
        songs={oldSongsB35}
        count={`${oldSongsB35.length}/${buckets[1].size}`}
        t={t}
        sum={b35Sum}
        average={b35Average}
        percentileMap={percentileMap}
      />
      {(remainingNewSongs.length > 0 || remainingOldSongs.length > 0) && (
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

  // Calculate ratings and sort by highest rating first
  const { newScores: newSongsB15, oldScores: oldSongsB35, newRemaining: newSongsRemaining, oldRemaining: oldSongsRemaining } = getPlayerRankings(game, selectedSnapshotData);

  const b50Songs = useMemo(() => [...newSongsB15, ...oldSongsB35], [newSongsB15, oldSongsB35]);

  const { data: percentileData } = trpc.user.getChartPercentiles.useQuery(
    { game: useGameId(),
      songs: b50Songs.map((s) => ({ publicSongId: s.songId, achievement: s.scoreValue })),
      userRating: snapshot.rating,
    },
    {
      enabled: game === "maimai" && !!(flags?.scorePercentile && b50Songs.length > 0 && snapshot.rating > 0),
      staleTime: 1000 * 60 * 5,
    }
  );
  const percentileMap: PercentileMap = percentileData?.percentiles ?? {};

  // Filter songs based on search query
  const filteredData = useMemo(() => {
    if (!searchQuery.trim()) {
      return { newSongsB15, oldSongsB35, newSongsRemaining, oldSongsRemaining };
    }

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
      newSongsB15: filterSongs(newSongsB15),
      oldSongsB35: filterSongs(oldSongsB35),
      newSongsRemaining: filterSongs(newSongsRemaining),
      oldSongsRemaining: filterSongs(oldSongsRemaining),
    };
  }, [searchQuery, newSongsB15, oldSongsB35, newSongsRemaining, oldSongsRemaining]);

  const showRatingSum = game === "maimai";

  // Calculate sum and average for B15 and B35 (use filtered data)
  const b15Sum = filteredData.newSongsB15.reduce((sum, song) => sum + song.rating, 0);
  const b15Average = filteredData.newSongsB15.length > 0 ? b15Sum / filteredData.newSongsB15.length : 0;
  const b35Sum = filteredData.oldSongsB35.reduce((sum, song) => sum + song.rating, 0);
  const b35Average = filteredData.oldSongsB35.length > 0 ? b35Sum / filteredData.oldSongsB35.length : 0;

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
          {game === "maimai" && <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <MaimaiRatingDistributionChart songs={newSongsB15} title={buckets[0].label} />
            <MaimaiRatingDistributionChart songs={oldSongsB35} title={buckets[1].label} />
          </div>}

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
                <SongsGrid
                  newSongsB15={filteredData.newSongsB15}
                  oldSongsB35={filteredData.oldSongsB35}
                  remainingNewSongs={filteredData.newSongsRemaining}
                  remainingOldSongs={filteredData.oldSongsRemaining}
                  t={t}
                  b15Sum={showRatingSum ? b15Sum : undefined}
                  b15Average={b15Average}
                  b35Sum={showRatingSum ? b35Sum : undefined}
                  b35Average={b35Average}
                  percentileMap={percentileMap}
                />
              </motion.div>
            ) : (
              <motion.div
                key="list"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={getTransition({ duration: 0.3, ease: [0.4, 0, 0.2, 1] })}
              >
                <SongsList
                  newSongsB15={filteredData.newSongsB15}
                  oldSongsB35={filteredData.oldSongsB35}
                  remainingNewSongs={filteredData.newSongsRemaining}
                  remainingOldSongs={filteredData.oldSongsRemaining}
                  t={t}
                  displayMode={displayMode}
                  b15Sum={showRatingSum ? b15Sum : undefined}
                  b15Average={b15Average}
                  b35Sum={showRatingSum ? b35Sum : undefined}
                  b35Average={b35Average}
                  percentileMap={percentileMap}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
