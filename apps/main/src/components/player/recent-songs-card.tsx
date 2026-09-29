"use client";

import type { RecentPlay } from "@/server/queries/recents";
import { formatGameScore, formatGameLevel, getGameDifficulty, getGameStatusLabels } from "@/lib/games/presentation";
import { useGameId } from "@/components/providers/game-provider";
import { trpc } from "@/lib/trpc-client";
import { Region } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp, Clock, Loader2, AlertCircle, CloudOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { RecentSongsCardSkeleton } from "./recent-songs-card.skeleton";

import { CoverImage } from "@/components/cover-image";
import { useCallback, useState, useEffect, useRef } from "react";
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll";
import { Badge } from "@tomomai/ui";
import { ChartTypeBadge } from "@/components/games/chart-type-badge";
import { GAME_UI } from "@/components/games/registry";
import { motion } from "motion/react";
import { STAGGER, getTransition } from "@/lib/animation-constants";
import { useMediaQuery } from "@/hooks/use-media-query";

interface RecentSongsCardProps {
  region: Region;
  beforeDate?: Date;
  snapshotId?: string;
}

interface RecentSongRowProps {
  play: RecentPlay;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  onToggleExpand: (id: string) => void;
  isExpanded: boolean;
}

function RecentSongRow({ play, index, isFirst, isLast, onToggleExpand, isExpanded }: RecentSongRowProps) {
  const game = useGameId();
  const t = useTranslations('recentPlays');
  const isDesktop = useMediaQuery("(min-width: 768px)", { initializeWithValue: false });
  const [isRowHovered, setIsRowHovered] = useState(false);
  const isDetailed = game === "maimai" ? play.rating !== null : play.chunithmDetails != null;
  const canExpand = game === "maimai" || isDetailed;
  const playDate = new Date(play.playedAt);
  const difficulty = getGameDifficulty(game, play.difficultyCode);
  const { RecentDetails } = GAME_UI[game];

  return (
    <motion.div
      key={play.recentSongId}
      onClick={canExpand ? () => onToggleExpand(play.recentSongId.toString()) : undefined}
      onHoverStart={() => setIsRowHovered(true)}
      onHoverEnd={() => setIsRowHovered(false)}
      className={cn("flex flex-col transition-colors group",
        canExpand && "cursor-pointer",
        isFirst ? "pb-4" : isLast ? "pt-4" : "py-4",
      )}
      initial={{ opacity: 0, scale: 0.95, ...(isDesktop ? { x: -20 } : { y: 20 }) }}
      animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
      transition={getTransition({
        type: 'spring',
        stiffness: 400,
        damping: 25,
        delay: STAGGER.calculateDelay(index, 0.05, 0.3)
      })}
    >
      <div className="flex gap-4">
        {/* Song Cover */}
        <motion.div
          className="relative shrink-0"
          animate={isRowHovered ? {
            scale: 1.05,
            rotate: 2,
          } : {
            scale: 1,
            rotate: 0,
          }}
          transition={getTransition({ type: 'spring', stiffness: 400, damping: 15 })}
        >
          <CoverImage
            coverUrl={play.cover}
            alt={play.songName}
            className={cn(
              "w-14 h-14 rounded ring-2 ring-offset-2 ring-offset-background object-cover",
              difficulty.classes.ring,
            )}
            width={56}
            height={56}
            loading="lazy"
          />
          {/* Difficulty Badge */}
          <div className="absolute top-8 -right-0.5 w-2 h-4 bg-transparent rounded-br-full"
            style={{
              boxShadow: "0 8px 0 0 var(--difficulty-color)",
              // @ts-ignore
              "--difficulty-color": difficulty.cssVar,
            }} />
          <div
            className={cn(
              "absolute top-12 -right-1 px-1.5 py-0.5 rounded rounded-tr-none rounded-br-[8px] text-xs font-semibold text-white",
              difficulty.classes.badge,
            )}
          >
            {formatGameLevel(game, play.levelPrecise, play.difficultyCode)}
          </div>
        </motion.div>

        {/* Song Info */}
        <div className="flex-1 min-w-0 self-center">
          <h4 className="font-semibold truncate">
            {play.songName}

            {/* Not fetched indicator */}
            {!isDetailed && (
              <motion.span
                animate={isRowHovered ? {
                  scale: 1.03,
                } : {
                  scale: 1,
                }}
                transition={getTransition({ type: 'spring', stiffness: 500, damping: 20 })}
              >
                <Badge variant="outline" className="ml-2 text-muted-foreground text-xs">
                  <CloudOff className="h-3 w-3 mr-1" />
                  {t('notFetched')}
                </Badge>
              </motion.span>
            )}
          </h4>
          <p className="text-xs text-muted-foreground truncate">
            {play.artist}
          </p>
          <div className="flex items-center gap-1.5 mt-1.5">
            <ChartTypeBadge typeCode={play.typeCode} />
            {play.genre && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-secondary text-secondary-foreground font-medium truncate max-w-[120px]">
                {play.genre}
              </span>
            )}
          </div>
        </div>
        <div className="text-right shrink-0 space-y-0.5 flex flex-col items-end justify-between">
          {/* Track and Date at the very top */}
          <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
            <span className="hidden sm:block">{playDate.toLocaleDateString()} {playDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            <motion.div
              animate={isRowHovered ? {
                scale: 1.05,
              } : {
                scale: 1,
              }}
              transition={getTransition({ type: 'spring', stiffness: 500, damping: 20 })}
            >
              <Badge variant="secondary" className="text-xs">
                Track {play.track}
              </Badge>
            </motion.div>
          </div>
          {/* FC/FS badges */}
          {getGameStatusLabels(game, play).length > 0 ? (
            <motion.div
              className="text-xs text-muted-foreground"
              animate={isRowHovered ? {
                scale: 1.05,
              } : {
                scale: 1,
              }}
              transition={getTransition({ type: 'spring', stiffness: 500, damping: 20 })}
            >
              {getGameStatusLabels(game, play).join(" ")}
            </motion.div>
          ) : null}
          {/* Achievement */}
          <motion.div
            className="font-mono text-sm font-semibold"
            animate={isRowHovered ? {
              scale: 1.05,
              color: 'hsl(var(--primary))',
            } : {
              scale: 1,
              color: 'hsl(var(--foreground))',
            }}
            transition={getTransition({ type: 'spring', stiffness: 500, damping: 20 })}
          >
            {formatGameScore(game, play.scoreValue)}
          </motion.div>
        </div>
      </div>

      {/* Expand hint */}
      {canExpand && !isExpanded && (
        <button type="button" aria-expanded={false} className="flex w-full items-center justify-center gap-1 text-xs text-muted-foreground mt-4 md:mt-2">
          <ChevronDown className="h-3 w-3" />
          <span>{t('clickToExpand')}</span>
        </button>
      )}
      {canExpand && isExpanded && (
        <button type="button" aria-expanded={true} className="flex w-full items-center justify-center gap-1 text-xs text-muted-foreground mt-4 md:mt-2">
          <ChevronUp className="h-3 w-3" />
          <span>{t('clickToCollapse')}</span>
        </button>
      )}

      <RecentDetails play={play} isExpanded={isExpanded} isDetailed={isDetailed} />
    </motion.div>
  );
}

export function RecentSongsCard({ region, beforeDate, snapshotId }: RecentSongsCardProps) {
  const game = useGameId();
  const errorsT = useTranslations("dataContent");
  const t = useTranslations('recentPlays');
  const [allPlays, setAllPlays] = useState<RecentPlay[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const limit = 25;

  // Track which offsets have been processed to prevent duplicates
  const processedOffsetsRef = useRef<Set<number>>(new Set());

  const { data: ownData, isLoading: ownLoading, isFetching: ownFetching, error: ownError } = trpc.user.getRecentSongs.useQuery(
    { game: useGameId(), region, limit, offset, beforeDate },
    { enabled: !snapshotId }
  );
  const { data: publicData, isLoading: publicLoading, isFetching: publicFetching, error: publicError } = trpc.user.getPublicRecentSongs.useQuery(
    { game: useGameId(), snapshotId: snapshotId!, region, limit, offset, beforeDate },
    { enabled: !!snapshotId }
  );
  const data = snapshotId ? publicData : ownData;
  const isLoading = snapshotId ? publicLoading : ownLoading;
  const isFetching = snapshotId ? publicFetching : ownFetching;
  const error = snapshotId ? publicError : ownError;

  // Reset pagination state when region or beforeDate changes.
  // Depend on the time value rather than the Date reference — callers commonly
  // pass a fresh Date instance per render, which would otherwise wipe state
  // after the data effect has populated allPlays.
  const beforeDateKey = beforeDate?.getTime();
  useEffect(() => {
    setOffset(0);
    setAllPlays([]);
    setHasMore(false);
    processedOffsetsRef.current = new Set();
  }, [game, region, beforeDateKey]);

  // Update allPlays when new data arrives
  // Use isFetching (not isLoading) to prevent processing stale data during query transitions
  // isFetching is true whenever a query is in flight, even if there's cached data
  useEffect(() => {
    if (data && !isFetching && !processedOffsetsRef.current.has(offset)) {
      processedOffsetsRef.current.add(offset);
      if (offset === 0) {
        setAllPlays(data.recentPlays);
      } else {
        setAllPlays(prev => [...prev, ...data.recentPlays]);
      }
      setHasMore(data.hasMore);
    }
  }, [data, offset, isFetching]);

  const loadMore = useCallback(() => {
    if (hasMore && !isFetching) {
      setOffset(prev => prev + limit);
    }
  }, [hasMore, isFetching]);

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  }, []);

  const sentinelRef = useInfiniteScroll(loadMore, hasMore && !isFetching);

  if (isLoading && offset === 0) {
    return <RecentSongsCardSkeleton />;
  }

  if (error) {
    return (
      <div className="space-y-6">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Clock className="h-5 w-5" />
          {t('title')}
        </h2>
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <AlertCircle className="h-5 w-5 mr-2" />
          <span role="alert">{errorsT("loadError")}</span>
        </div>
      </div>
    );
  }

  // Only show "no plays" after we've actually processed the initial data
  // This prevents returning early before the data effect runs,
  // which would prevent the sentinel from being rendered
  if (allPlays.length === 0 && !isLoading && processedOffsetsRef.current.has(0)) {
    return (
      <div className="space-y-6">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Clock className="h-5 w-5" />
          {t('title')}
        </h2>
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <span>{t('noPlays')}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold flex items-center gap-2">
        <Clock className="h-5 w-5" />
        {t('title')}
      </h2>
      <div>
        <div className="divide-y divide-border divide-dashed">
          {allPlays.map((play, i) => (
            <RecentSongRow
              key={play.recentSongId}
              play={play}
              index={i}
              isFirst={i === 0}
              isLast={i === allPlays.length - 1}
              onToggleExpand={toggleExpand}
              isExpanded={expandedIds.has(play.recentSongId.toString())}
            />
          ))}

          {/* Infinite scroll sentinel */}
          {hasMore && (
            <div ref={sentinelRef} className="flex justify-center py-4">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
