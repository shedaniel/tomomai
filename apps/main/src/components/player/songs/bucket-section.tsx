"use client";

import { Fragment, useCallback } from "react";
import { motion } from "motion/react";
import { useTranslations } from "next-intl";
import { useGameId, usePresentation } from "@/components/providers/game-provider";
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll";
import { STAGGER, getTransition } from "@/lib/animation-constants";
import { formatGameScore, formatGameRating, formatGameLevel, getGameDifficulty, getGameStatusLabels } from "@/lib/games/presentation";
import type { PercentileMap } from "@/lib/games/maimai/percentile/types";
import { cn } from "@/lib/utils";
import { BucketHeader } from "./bucket-header";
import { SongGridCard } from "./score-grid-card";
import { SongRow } from "./score-row";
import type { RatedScore } from "./types";

// Component for rendering compact song section as a single grid
function CompactSongSection({ title, songs, count, ranked, visibleCount, onLoadMore }: {
  title: string;
  songs: RatedScore[];
  count?: string;
  ranked?: boolean;
  visibleCount: number;
  onLoadMore: () => void;
}) {
  const t = useTranslations();
  const game = useGameId();
  const { statusColumns, scoreLabel } = usePresentation();
  const hasMore = visibleCount < songs.length;
  const loadMore = useCallback(() => {
    if (hasMore) onLoadMore();
  }, [hasMore, onLoadMore]);

  const sentinelRef = useInfiniteScroll(loadMore, hasMore);
  const visibleSongs = songs.slice(0, visibleCount);

  if (songs.length === 0) return null;

  return (
    <div className="space-y-2">
      <BucketHeader title={title} count={count} ratings={ranked ? songs.map(song => song.rating) : undefined} className="mb-2 px-2" />
      <div className="grid text-xs overflow-x-auto" style={{ gridTemplateColumns: `4fr 2fr repeat(${3 + statusColumns.length}, min-content)` }}>
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
          {t(`dataContent.tableHeaders.${scoreLabel}`)}
        </div>
        {statusColumns.map(column => (
          <div key={column.labelKey} className="font-semibold text-muted-foreground border-b border-border pb-1 px-2 min-w-10 text-center whitespace-nowrap">
            {t(`dataContent.tableHeaders.${column.labelKey}`)}
          </div>
        ))}
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
              getGameDifficulty(game, song.difficultyCode).classes.cell,
            )}>
              {formatGameLevel(game, song.levelPrecise, song.difficultyCode)}
            </div>
            <div className="text-right font-mono py-1 px-2 border-b border-dashed border-border/90">
              {formatGameScore(game, song.scoreValue)}
            </div>
            {statusColumns.map(column => (
              <div key={column.labelKey} className="text-center text-muted-foreground py-1 px-2 border-b border-dashed border-border/90">
                {getGameStatusLabels(game, Object.fromEntries(column.kinds.map(kind => [kind, song[kind]]))).join(" ")}
              </div>
            ))}
            <div className="text-right font-mono font-semibold py-1 px-2 border-b border-dashed border-border/90">
              {formatGameRating(game, song.rating)}
            </div>
          </Fragment>
        ))}

        {/* Sentinel for infinite scroll - spans all columns */}
        {hasMore && (
          <div ref={sentinelRef} className="col-span-full h-4" />
        )}
      </div>
    </div>
  );
}

// Component for rendering song sections
export function SongSection({ title, songs, count, ranked, displayMode, visibleCount, onLoadMore, percentileMap }: {
  title: string;
  songs: RatedScore[];
  count?: string;
  /** A ranking bucket, whose header summarizes the ratings. */
  ranked?: boolean;
  displayMode: "list" | "compact";
  visibleCount: number;
  onLoadMore: () => void;
  percentileMap?: PercentileMap;
}) {
  const hasMore = visibleCount < songs.length;
  const loadMore = useCallback(() => {
    if (hasMore) onLoadMore();
  }, [hasMore, onLoadMore]);

  const sentinelRef = useInfiniteScroll(loadMore, hasMore);
  const visibleSongs = songs.slice(0, visibleCount);

  if (songs.length === 0) return null;

  // Use dedicated compact section for compact mode
  if (displayMode === "compact") {
    return <CompactSongSection title={title} songs={songs} count={count} ranked={ranked} visibleCount={visibleCount} onLoadMore={onLoadMore} />;
  }

  return (
    <div className="space-y-2">
      <BucketHeader title={title} count={count} ratings={ranked ? songs.map(song => song.rating) : undefined} className="mb-2" />
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

export function SongGridSection({ title, songs, count, percentileMap }: {
  title: string;
  songs: RatedScore[];
  count: string;
  percentileMap?: PercentileMap;
}) {
  if (songs.length === 0) return null;

  return (
    <div className="space-y-4">
      <BucketHeader title={title} count={count} ratings={songs.map(song => song.rating)} />
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
