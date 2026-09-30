"use client";

import type { RecentPlay } from "@/lib/trpc-types";
import { useGame } from "@/components/providers/game-provider";
import { trpc } from "@/lib/trpc-client";
import { Region } from "@/lib/types";
import { Clock, Loader2, AlertCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { RecentSongsCardSkeleton } from "./recent-songs-card.skeleton";
import { RecentPlayRow } from "./recent-play-row";
import { useCallback, useState, useEffect, useRef } from "react";
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll";

interface RecentSongsCardProps {
  region: Region;
  beforeDate?: Date;
  snapshotId?: string;
}

export function RecentSongsCard({ region, beforeDate, snapshotId }: RecentSongsCardProps) {
  const game = useGame().id;
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
    { game, region, limit, offset, beforeDate },
    { enabled: !snapshotId }
  );
  const { data: publicData, isLoading: publicLoading, isFetching: publicFetching, error: publicError } = trpc.user.getPublicRecentSongs.useQuery(
    { game, snapshotId: snapshotId!, limit, offset, beforeDate },
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
            <RecentPlayRow
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
