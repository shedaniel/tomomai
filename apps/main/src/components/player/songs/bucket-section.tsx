"use client";

import { Fragment, useCallback } from "react";
import { Plus, TrendingUp } from "lucide-react";
import { motion } from "motion/react";
import { useGameId } from "@/components/providers/game-provider";
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll";
import { STAGGER, getTransition } from "@/lib/animation-constants";
import { formatGameScore, formatGameRating, formatGameLevel, getGameDifficultyColors, getGameStatusLabels, getGameScoreLabelKey } from "@/lib/games/presentation";
import type { PercentileMap } from "@/lib/games/maimai/percentile/types";
import { cn } from "@/lib/utils";
import { SongGridCard } from "./score-grid-card";
import { SongRow } from "./score-row";
import type { RatedScore } from "./types";

// Component for rendering compact song section as a single grid
function CompactSongSection({ title, songs, count, t, sum, average, visibleCount, onLoadMore }: {
  title: string;
  songs: RatedScore[];
  count?: string;
  t: any;
  sum?: number;
  average?: number;
  visibleCount: number;
  onLoadMore: () => void;
}) {
  const game = useGameId();
  const hasMore = visibleCount < songs.length;
  const loadMore = useCallback(() => {
    if (hasMore) onLoadMore();
  }, [hasMore, onLoadMore]);

  const sentinelRef = useInfiniteScroll(loadMore, hasMore);
  const visibleSongs = songs.slice(0, visibleCount);

  if (songs.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center mb-2 px-2">
        <h5 className="font-semibold text-sm">{title} {count && `(${count})`}</h5>
        {(sum !== undefined || average !== undefined) && (
          <div className="flex gap-4 text-xs text-muted-foreground">
            {sum !== undefined && (
              <div className="flex items-center gap-1 whitespace-nowrap">
                <Plus className="h-3 w-3" />
                <span>{t('dataContent.statistics.sum')}</span>
                <span className="font-mono font-medium">{formatGameRating(game, sum)}</span>
              </div>
            )}
            {average !== undefined && (
              <div className="flex items-center gap-1 whitespace-nowrap">
                <TrendingUp className="h-3 w-3" />
                <span>{t('dataContent.statistics.average')}</span>
                <span className="font-mono font-medium">{game === "maimai" ? average.toFixed(2) : formatGameRating(game, average)}</span>
              </div>
            )}
          </div>
        )}
      </div>
      <div className="grid grid-cols-[4fr_2fr_min-content_min-content_min-content_min-content_min-content] text-xs overflow-x-auto">
        {/* Headers */}
        <div className="font-semibold text-muted-foreground border-b border-border pb-1 px-2 text-left whitespace-nowrap min-w-48">
          {t('dataContent.tableHeaders.song')}
        </div>
        <div className="font-semibold text-muted-foreground border-b border-border pb-1 px-2 text-left whitespace-nowrap min-w-24">
          {t('dataContent.tableHeaders.artist')}
        </div>
        <div className="font-semibold text-muted-foreground border-b border-border pb-1 px-2 text-center whitespace-nowrap">
          {t('dataContent.tableHeaders.level')}
        </div>
        <div className="font-semibold text-muted-foreground border-b border-border pb-1 px-2 text-center whitespace-nowrap">
          {t(getGameScoreLabelKey(game))}
        </div>
        <div className="font-semibold text-muted-foreground border-b border-border pb-1 px-2 min-w-10 text-center whitespace-nowrap">
          {game === "maimai" ? t("dataContent.tableHeaders.fc") : t("dataContent.tableHeaders.status")}
        </div>
        <div className="font-semibold text-muted-foreground border-b border-border pb-1 px-2 min-w-10 text-center whitespace-nowrap">
          {game === "maimai" ? t("dataContent.tableHeaders.fs") : t("dataContent.tableHeaders.status")}
        </div>
        <div className="font-semibold text-muted-foreground border-b border-border pb-1 px-2 text-center whitespace-nowrap">
          {t('dataContent.tableHeaders.rating')}
        </div>

        {/* Song Data */}
        {visibleSongs.map(song => (
          <Fragment key={`${song.songId}-${song.difficultyCode}`}>
            <div className="truncate font-medium py-1 px-2 border-b border-dashed border-border/90">
              {song.songName}
            </div>
            <div className="truncate text-muted-foreground py-1 px-2 border-b border-dashed border-border/90">
              {song.artist}
            </div>
            <div className={cn("text-center border-b grid items-center font-medium border-dashed",
              getGameDifficultyColors(game, song.difficultyCode).bg,
              getGameDifficultyColors(game, song.difficultyCode).text,
            )}>
              {formatGameLevel(game, song.levelPrecise, song.difficultyCode)}
            </div>
            <div className="text-right font-mono py-1 px-2 border-b border-dashed border-border/90">
              {formatGameScore(game, song.scoreValue)}
            </div>
            <div className="text-center text-muted-foreground py-1 px-2 border-b border-dashed border-border/90">
              {getGameStatusLabels(game, { comboStatus: song.comboStatus }).join(" ")}
            </div>
            <div className="text-center text-muted-foreground py-1 px-2 border-b border-dashed border-border/90">
              {getGameStatusLabels(game, { syncStatus: song.syncStatus, clearStatus: song.clearStatus }).join(" ")}
            </div>
            <div className="text-right font-mono font-semibold py-1 px-2 border-b border-dashed border-border/90">
              {formatGameRating(game, song.rating)}
            </div>
          </Fragment>
        ))}

        {/* Sentinel for infinite scroll - spans all columns */}
        {hasMore && (
          <div ref={sentinelRef} className="col-span-7 h-4" />
        )}
      </div>
    </div>
  );
}

// Component for rendering song sections
export function SongSection({ title, songs, count, displayMode, t, sum, average, visibleCount, onLoadMore, percentileMap }: {
  title: string;
  songs: RatedScore[];
  count?: string;
  displayMode: "list" | "grid" | "compact";
  t: any;
  sum?: number;
  average?: number;
  visibleCount: number;
  onLoadMore: () => void;
  percentileMap?: PercentileMap;
}) {
  const game = useGameId();
  const hasMore = visibleCount < songs.length;
  const loadMore = useCallback(() => {
    if (hasMore) onLoadMore();
  }, [hasMore, onLoadMore]);

  const sentinelRef = useInfiniteScroll(loadMore, hasMore);
  const visibleSongs = songs.slice(0, visibleCount);

  if (songs.length === 0) return null;

  // Use dedicated compact section for compact mode
  if (displayMode === "compact") {
    return <CompactSongSection title={title} songs={songs} count={count} t={t} sum={sum} average={average} visibleCount={visibleCount} onLoadMore={onLoadMore} />;
  }

  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center mb-2">
        <h5 className="font-semibold text-sm">{title} {count && `(${count})`}</h5>
        {(sum !== undefined || average !== undefined) && (
          <div className="flex gap-4 text-xs text-muted-foreground">
            {sum !== undefined && (
              <div className="flex items-center gap-1 whitespace-nowrap">
                <Plus className="h-3 w-3" />
                <span>{t('dataContent.statistics.sum')}</span>
                <span className="font-mono font-medium">{formatGameRating(game, sum)}</span>
              </div>
            )}
            {average !== undefined && (
              <div className="flex items-center gap-1 whitespace-nowrap">
                <TrendingUp className="h-3 w-3" />
                <span>{t('dataContent.statistics.average')}</span>
                <span className="font-mono font-medium">{game === "maimai" ? average.toFixed(2) : formatGameRating(game, average)}</span>
              </div>
            )}
          </div>
        )}
      </div>
      <div className="space-y-2">
        {visibleSongs.map(song => (
          <SongRow key={`${song.songId}-${song.difficultyCode}`} song={song} percentile={percentileMap?.[song.songId]} />
        ))}
        {hasMore && (
          <div ref={sentinelRef} className="h-4" />
        )}
      </div>
    </div>
  );
}

export function SongGridSection({ title, songs, count, t, sum, average, percentileMap }: {
  title: string;
  songs: RatedScore[];
  count?: string;
  t: any;
  sum?: number;
  average?: number;
  percentileMap?: PercentileMap;
}) {
  const game = useGameId();
  if (songs.length === 0) return null;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h5 className="font-semibold text-sm">{title} {count && `(${count})`}</h5>
        {(sum !== undefined || average !== undefined) && (
          <div className="flex gap-4 text-xs text-muted-foreground">
            {sum !== undefined && (
              <div className="flex items-center gap-1 whitespace-nowrap">
                <Plus className="h-3 w-3" />
                <span>{t('dataContent.statistics.sum')}</span>
                <span className="font-mono font-medium">{formatGameRating(game, sum)}</span>
              </div>
            )}
            {average !== undefined && (
              <div className="flex items-center gap-1 whitespace-nowrap">
                <TrendingUp className="h-3 w-3" />
                <span>{t('dataContent.statistics.average')}</span>
                <span className="font-mono font-medium">{game === "maimai" ? average.toFixed(2) : formatGameRating(game, average)}</span>
              </div>
            )}
          </div>
        )}
      </div>
      <div className="grid grid-cols-1 2xs:grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {songs.map((song, index) => (
          <motion.div
            key={`${song.songId}-${song.difficultyCode}`}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              delay: STAGGER.calculateDelay(index, 0.03, 0.15),
              duration: 0.3,
              ease: [0.4, 0, 0.2, 1],
              ...getTransition({}),
            }}
          >
            <SongGridCard song={song} percentile={percentileMap?.[song.songId]} />
          </motion.div>
        ))}
      </div>
    </div>
  );
}
