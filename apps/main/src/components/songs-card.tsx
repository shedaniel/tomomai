"use client";

import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@tomomai/ui";
import { SongWithRating, splitSongs } from "@/lib/rating-calculator";
import { MinimalSongForDisplay, SnapshotWithSongs } from "@/lib/types";
import { cn, createSafeMaimaiImageUrl, getTypeBadgeUrl } from "@/lib/utils";
import { LayoutGrid, LayoutList, Menu, Plus, Search, TrendingUp } from "lucide-react";
import { useTranslations } from "next-intl";

import { CoverImage } from "@/components/cover-image";
import { Fragment, useCallback, useMemo, useState, forwardRef } from "react";
import { Bar, BarChart, XAxis, YAxis } from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@tomomai/ui/select-friendly";
import { Input } from "@tomomai/ui";
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll";
import { SongHoverCard } from "@/components/song-hover-card";
import { renderLevelPrecise } from "@tomomai/catalog/name-utils";
import { motion, AnimatePresence } from "motion/react";
import { SPRING_CONFIGS, STAGGER, getTransition } from "@/lib/animation-constants";
import { trpc } from "@/lib/trpc-client";
import { Flags } from "@/lib/flags";
import type { PercentileEntry, PercentileMap } from "@/lib/percentile-types";

// Helper function to group songs by individual rating values and difficulty
function groupSongsByRating(songs: SongWithRating[]) {
  if (songs.length === 0) return [];

  const ratings = songs.map(song => song.rating);
  const minRating = Math.min(...ratings);
  const maxRating = Math.max(...ratings);

  const grouped = [];
  for (let rating = minRating; rating <= maxRating; rating++) {
    const songsAtRating = songs.filter(song => song.rating === rating);

    // Group by difficulty within each rating
    const difficultyCounts = {
      basic: songsAtRating.filter(s => s.difficulty === 'basic').length,
      advanced: songsAtRating.filter(s => s.difficulty === 'advanced').length,
      expert: songsAtRating.filter(s => s.difficulty === 'expert').length,
      master: songsAtRating.filter(s => s.difficulty === 'master').length,
      remaster: songsAtRating.filter(s => s.difficulty === 'remaster').length,
      utage: songsAtRating.filter(s => s.difficulty === 'utage').length,
    };

    grouped.push({
      rating: rating.toString(),
      ...difficultyCounts,
      total: songsAtRating.length,
    });
  }

  return grouped;
}

// Chart configuration
const chartConfig = {
  basic: {
    label: "Basic",
    color: "hsl(142, 76%, 36%)", // green
  },
  advanced: {
    label: "Advanced",
    color: "hsl(45, 93%, 47%)", // yellow
  },
  expert: {
    label: "Expert",
    color: "hsl(0, 84%, 60%)", // red
  },
  master: {
    label: "Master",
    color: "hsl(271, 81%, 56%)", // purple
  },
  remaster: {
    label: "Re:Master",
    color: "hsl(270, 95%, 85%)", // light purple
  },
  utage: {
    label: "Utage",
    color: "hsl(330, 81%, 60%)", // pink
  },
};

// Component for rating chart
function RatingChart({ songs, title }: { songs: SongWithRating[]; title: string }) {
  const chartData = groupSongsByRating(songs);

  if (songs.length === 0) return null;

  return (
    <div className="space-y-2 flex flex-col border border-border py-4 rounded-md">
      <span className="text-sm text-center font-semibold">{title}</span>
      <ChartContainer config={chartConfig} className="h-[200px] w-full pr-10">
        <BarChart data={chartData}>
          <XAxis
            dataKey="rating"
            tickLine={false}
            tickMargin={10}
            axisLine={false}
            tick={{ fontSize: 11 }}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11 }}
          />
          <ChartTooltip
            content={<ChartTooltipContent hideLabel />}
          />
          <Bar
            dataKey="basic"
            stackId="difficulty"
            fill="var(--color-basic)"
            radius={[0, 0, 0, 0]}
          />
          <Bar
            dataKey="advanced"
            stackId="difficulty"
            fill="var(--color-advanced)"
            radius={[0, 0, 0, 0]}
          />
          <Bar
            dataKey="expert"
            stackId="difficulty"
            fill="var(--color-expert)"
            radius={[0, 0, 0, 0]}
          />
          <Bar
            dataKey="master"
            stackId="difficulty"
            fill="var(--color-master)"
            radius={[0, 0, 0, 0]}
          />
          <Bar
            dataKey="remaster"
            stackId="difficulty"
            fill="var(--color-remaster)"
            radius={[0, 0, 0, 0]}
          />
          <Bar
            dataKey="utage"
            stackId="difficulty"
            fill="var(--color-utage)"
            radius={[2, 2, 0, 0]}
          />
        </BarChart>
      </ChartContainer>
    </div>
  );
}

// Component for rendering individual song rows
const SongRow = forwardRef<HTMLDivElement, { song: SongWithRating; percentile?: PercentileEntry } & React.HTMLAttributes<HTMLDivElement>>(({ song, percentile, ...props }, ref) => {
  return (
    <SongHoverCard song={song} percentile={percentile ? { ...percentile, userAchievement: song.achievement } : undefined}>
      <div ref={ref} {...props} className={cn("group relative isolate flex justify-between items-center text-sm border-b border-dashed border-border pb-1.5 h-12 px-2 -mx-2 cursor-pointer", props.className)}>
        <div className="absolute inset-x-0 -top-1.5 bottom-0 rounded-md group-hover:bg-muted/50 transition-colors -z-10" />
        <CoverImage coverUrl={song.cover}
          alt={song.songName}
          className={cn(
            "w-8 h-8 ml-1 mr-3 rounded ring-2 ring-offset-2 ring-offset-background",
            song.difficulty === "basic" && "ring-green-400",
            song.difficulty === "advanced" && "ring-yellow-400",
            song.difficulty === "expert" && "ring-red-400",
            song.difficulty === "master" && "ring-purple-500",
            song.difficulty === "remaster" && "ring-purple-200",
            song.difficulty === "utage" && "ring-pink-400",
          )}
          width={36}
          height={36}
          loading="lazy"
        />
        <div className="flex-1 min-w-0">
          <div className="truncate font-medium">{song.songName}&#8203;</div>
          <div className="text-muted-foreground text-xs truncate">{song.type.toUpperCase()} • {song.difficulty.slice(0, 3).toUpperCase()} {renderLevelPrecise(song.levelPrecise, song.difficulty)} • {song.artist}</div>
        </div>
        <div className="text-right ml-2">
          <div className="font-mono">{(song.achievement / 10000).toFixed(4)}%</div>
          <div className="text-xs text-muted-foreground">{song.fc !== 'none' ? song.fc.toUpperCase() : ''} {song.fs !== 'none' ? song.fs.toUpperCase() : ''}&#8203;</div>
        </div>
        <div className="text-right ml-4 mr-2">
          <div className="font-mono text-md font-semibold">{song.rating}</div>
        </div>
      </div>
    </SongHoverCard>
  );
});
SongRow.displayName = "SongRow";

// Component for rendering compact song section as a single grid
function CompactSongSection({ title, songs, count, t, sum, average, visibleCount, onLoadMore }: {
  title: string;
  songs: SongWithRating[];
  count?: string;
  t: any;
  sum?: number;
  average?: number;
  visibleCount: number;
  onLoadMore: () => void;
}) {
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
                <span className="font-mono font-medium">{sum}</span>
              </div>
            )}
            {average !== undefined && (
              <div className="flex items-center gap-1 whitespace-nowrap">
                <TrendingUp className="h-3 w-3" />
                <span>{t('dataContent.statistics.average')}</span>
                <span className="font-mono font-medium">{average.toFixed(2)}</span>
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
          {t('dataContent.tableHeaders.achievement')}
        </div>
        <div className="font-semibold text-muted-foreground border-b border-border pb-1 px-2 min-w-10 text-center whitespace-nowrap">
          {t('dataContent.tableHeaders.fc')}
        </div>
        <div className="font-semibold text-muted-foreground border-b border-border pb-1 px-2 min-w-10 text-center whitespace-nowrap">
          {t('dataContent.tableHeaders.fs')}
        </div>
        <div className="font-semibold text-muted-foreground border-b border-border pb-1 px-2 text-center whitespace-nowrap">
          {t('dataContent.tableHeaders.rating')}
        </div>

        {/* Song Data */}
        {visibleSongs.map(song => (
          <Fragment key={`${song.songId}-${song.difficulty}`}>
            <div className="truncate font-medium py-1 px-2 border-b border-dashed border-border/90">
              {song.songName}
            </div>
            <div className="truncate text-muted-foreground py-1 px-2 border-b border-dashed border-border/90">
              {song.artist}
            </div>
            <div className={cn("text-center border-b grid items-center font-medium border-dashed",
              song.difficulty === "basic" && "bg-green-100 text-green-800 border-green-200 dark:bg-green-600/30 dark:text-green-400 dark:border-green-800",
              song.difficulty === "advanced" && "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-600/30 dark:text-yellow-400 dark:border-yellow-800",
              song.difficulty === "expert" && "bg-red-100 text-red-800 border-red-200 dark:bg-red-600/30 dark:text-red-400 dark:border-red-800",
              song.difficulty === "master" && "bg-purple-300 text-purple-900 border-purple-400 dark:bg-purple-600/30 dark:text-purple-400 dark:border-purple-800",
              song.difficulty === "remaster" && "bg-purple-50 text-purple-800 border-purple-200 dark:bg-purple-50/80 dark:border-purple-300",
              song.difficulty === "utage" && "bg-pink-100 text-pink-800 border-pink-200 dark:bg-pink-600/30 dark:text-pink-400 dark:border-pink-800",
            )}>
              {renderLevelPrecise(song.levelPrecise, song.difficulty)}
            </div>
            <div className="text-right font-mono py-1 px-2 border-b border-dashed border-border/90">
              {(song.achievement / 10000).toFixed(4)}%
            </div>
            <div className="text-center text-muted-foreground py-1 px-2 border-b border-dashed border-border/90">
              {song.fc !== 'none' ? song.fc.toUpperCase() : ''}
            </div>
            <div className="text-center text-muted-foreground py-1 px-2 border-b border-dashed border-border/90">
              {song.fs !== 'none' ? song.fs.toUpperCase() : ''}
            </div>
            <div className="text-right font-mono font-semibold py-1 px-2 border-b border-dashed border-border/90">
              {song.rating}
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

// Component for rendering individual song cards in grid view
export const SongGridCard = forwardRef<HTMLDivElement, { song: MinimalSongForDisplay; percentile?: PercentileEntry } & React.HTMLAttributes<HTMLDivElement>>(({ song, percentile, ...props }, ref) => {
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const card = e.currentTarget;
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const percentX = (x - centerX) / centerX;
    const percentY = -((y - centerY) / centerY);

    card.style.transform = `perspective(1000px) rotateY(${percentX * 8}deg) rotateX(${percentY * 8}deg) scale3d(1.02, 1.02, 1.02)`;

    const glow = card.querySelector('.song-card-glow') as HTMLElement;
    const content = card.querySelector('.song-card-content') as HTMLElement;

    if (glow) {
      glow.style.opacity = '1';
      glow.style.background = `
        radial-gradient(
          circle at
          ${x}px ${y}px,
          rgba(255, 255, 255, 0.2),
          rgba(255, 255, 255, 0.15),
          rgba(255, 255, 255, 0.05),
          transparent
        )
      `;
    }

    if (content) {
      content.style.transform = 'translateZ(10px)';
    }
  };

  const handleMouseLeave = (e: React.MouseEvent<HTMLDivElement>) => {
    const card = e.currentTarget;
    card.style.transform = 'perspective(1000px) rotateY(0deg) rotateX(0deg) scale3d(1, 1, 1)';

    const glow = card.querySelector('.song-card-glow') as HTMLElement;
    const content = card.querySelector('.song-card-content') as HTMLElement;

    if (glow) {
      glow.style.opacity = '0';
    }

    if (content) {
      content.style.transform = 'translateZ(0px)';
    }
  };

  return (
    <SongHoverCard song={song} side="right" percentile={percentile ? { ...percentile, userAchievement: song.achievement } : undefined}>
      <div
        ref={ref}
        {...props}
        className={cn("relative bg-white rounded-[8px] shadow-md transition-all duration-300 ease-out cursor-pointer ring-2",
          song.difficulty === "basic" && "ring-green-400",
          song.difficulty === "advanced" && "ring-yellow-400",
          song.difficulty === "expert" && "ring-red-400",
          song.difficulty === "master" && "ring-purple-500",
          song.difficulty === "remaster" && "ring-purple-200",
          song.difficulty === "utage" && "ring-pink-400",
          props.className
        )}
        style={{ ...props.style, aspectRatio: '16/10', transformStyle: 'preserve-3d', transform: 'perspective(1000px)' }}
        onMouseMove={(e) => { handleMouseMove(e); props.onMouseMove?.(e); }}
        onMouseLeave={(e) => { handleMouseLeave(e); props.onMouseLeave?.(e); }}
      >
        {/* Song Cover Background */}
        <CoverImage
          coverUrl={song.cover}
          alt={song.songName}
          fill
          className="object-cover rounded-[8px] overflow-hidden"
          loading="lazy"
        />

        {/* Dark overlay for text readability */}
        <div className="absolute inset-0 bg-linear-to-t from-black/90 via-black/40 to-transparent rounded-[8px] overflow-hidden" />

        {/* Difficulty Badge */}
        <div className={cn(
          "absolute top-[-0.5px] right-[-0.5px] px-1.5 py-0.5 rounded-tr-[8px] rounded-bl-[8px] overflow-hidden text-[10px] font-semibold text-white",
          song.difficulty === "basic" && "bg-green-500",
          song.difficulty === "advanced" && "bg-yellow-500",
          song.difficulty === "expert" && "bg-red-500",
          song.difficulty === "master" && "bg-purple-500",
          song.difficulty === "remaster" && "bg-purple-200 text-purple-900",
          song.difficulty === "utage" && "bg-pink-500",
        )}>
          {renderLevelPrecise(song.levelPrecise, song.difficulty)}
        </div>

        {/* Glow Effect */}
        <div className="song-card-glow absolute inset-[-2px] opacity-0 transition-opacity duration-300 pointer-events-none rounded-[8px] overflow-hidden" />

        <div className="song-card-content relative w-full h-full transition-transform duration-300"
          style={{ transform: 'translateZ(30px)' }}>
          {/* Song Type Badge */}
          <div className="absolute top-2.5 left-2.5 2xs:max-xs:left-2 2xs:max-xs:top-2 2xs:max-xs:scale-75 origin-top-left z-30">
            <img
              src={createSafeMaimaiImageUrl(getTypeBadgeUrl(song.type))}
              alt={song.type.toUpperCase()}
              width={37}
              height={11}
              className="drop-shadow-md"
              loading="lazy"
            />
          </div>

          {/* Song Info */}
          <div className="absolute bottom-0 left-0 right-0 p-2.5 text-white z-30">
            <div className="2xs:max-xs:text-xs text-sm font-[600] truncate mb-0.5 drop-shadow-md">
              {song.songName}
            </div>

            {/* Achievement and Rating */}
            <div className="flex justify-between items-end">
              <div className="2xs:max-xs:text-2xs text-xs space-x-1 2xs:max-xs:space-x-0.5">
                <span className="2xs:max-xs:text-[9px] font-mono font-medium drop-shadow-md">
                  {(song.achievement / 10000).toFixed(4)}%
                </span>
                <span className="2xs:max-xs:text-[7px] text-[10px] opacity-75 drop-shadow-md whitespace-nowrap">
                  {song.fc !== 'none' ? song.fc.toUpperCase() : ''}{song.fc !== 'none' && song.fs !== 'none' ? ' ' : ''}{song.fs !== 'none' ? song.fs.toUpperCase() : ''}
                </span>
              </div>
              <span className="2xs:max-xs:text-sm text-right text-lg font-bold font-mono drop-shadow-md leading-none align-bottom">
                {"rating" in song ? song.rating as number : ''}
              </span>
            </div>
          </div>
        </div>
      </div>
    </SongHoverCard>
  );
});
SongGridCard.displayName = "SongGridCard";

// Component for rendering song sections
function SongSection({ title, songs, count, displayMode, t, sum, average, visibleCount, onLoadMore, percentileMap }: {
  title: string;
  songs: SongWithRating[];
  count?: string;
  displayMode: "list" | "grid" | "compact";
  t: any;
  sum?: number;
  average?: number;
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
                <span className="font-mono font-medium">{sum}</span>
              </div>
            )}
            {average !== undefined && (
              <div className="flex items-center gap-1 whitespace-nowrap">
                <TrendingUp className="h-3 w-3" />
                <span>{t('dataContent.statistics.average')}</span>
                <span className="font-mono font-medium">{average.toFixed(2)}</span>
              </div>
            )}
          </div>
        )}
      </div>
      <div className="space-y-2">
        {visibleSongs.map(song => (
          <SongRow key={`${song.songId}-${song.difficulty}`} song={song} percentile={percentileMap?.[song.songId]} />
        ))}
        {hasMore && (
          <div ref={sentinelRef} className="h-4" />
        )}
      </div>
    </div>
  );
}

function SongGridSection({ title, songs, count, t, sum, average, percentileMap }: {
  title: string;
  songs: SongWithRating[];
  count?: string;
  t: any;
  sum?: number;
  average?: number;
  percentileMap?: PercentileMap;
}) {
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
                <span className="font-mono font-medium">{sum}</span>
              </div>
            )}
            {average !== undefined && (
              <div className="flex items-center gap-1 whitespace-nowrap">
                <TrendingUp className="h-3 w-3" />
                <span>{t('dataContent.statistics.average')}</span>
                <span className="font-mono font-medium">{average.toFixed(2)}</span>
              </div>
            )}
          </div>
        )}
      </div>
      <div className="grid grid-cols-1 2xs:grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {songs.map((song, index) => (
          <motion.div
            key={`${song.songId}-${song.difficulty}`}
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

// Component for rendering the songs list with four sections
function SongsList({ newSongsB15, oldSongsB35, remainingNewSongs, remainingOldSongs, t, displayMode, b15Sum, b15Average, b35Sum, b35Average, percentileMap }: {
  newSongsB15: SongWithRating[];
  oldSongsB35: SongWithRating[];
  remainingNewSongs: SongWithRating[];
  remainingOldSongs: SongWithRating[];
  t: any;
  displayMode: "list" | "compact";
  b15Sum?: number;
  b15Average?: number;
  b35Sum?: number;
  b35Average?: number;
  percentileMap?: PercentileMap;
}) {
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
        title={t('dataContent.newSongsB15')}
        songs={newSongsB15}
        count={`${newSongsB15.length}/15`}
        displayMode={displayMode}
        t={t}
        sum={b15Sum}
        average={b15Average}
        visibleCount={visibleB15}
        onLoadMore={loadMoreB15}
        percentileMap={percentileMap}
      />
      <SongSection
        title={t('dataContent.oldSongsB35')}
        songs={oldSongsB35}
        count={`${oldSongsB35.length}/35`}
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

function SongsGrid({ newSongsB15, oldSongsB35, remainingNewSongs, remainingOldSongs, t, b15Sum, b15Average, b35Sum, b35Average, percentileMap }: { newSongsB15: SongWithRating[]; oldSongsB35: SongWithRating[]; remainingNewSongs: SongWithRating[]; remainingOldSongs: SongWithRating[]; t: any; b15Sum?: number; b15Average?: number; b35Sum?: number; b35Average?: number; percentileMap?: PercentileMap }) {
  return (
    <div className="space-y-6">
      <SongGridSection
        title={t('dataContent.newSongsB15')}
        songs={newSongsB15}
        count={`${newSongsB15.length}/15`}
        t={t}
        sum={b15Sum}
        average={b15Average}
        percentileMap={percentileMap}
      />
      <SongGridSection
        title={t('dataContent.oldSongsB35')}
        songs={oldSongsB35}
        count={`${oldSongsB35.length}/35`}
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

export function SongsCard({ selectedSnapshotData, flags }: { selectedSnapshotData: SnapshotWithSongs; flags?: Flags }) {
  const t = useTranslations();
  const [displayMode, setDisplayMode] = useState<"list" | "grid" | "compact">("grid");
  const [searchQuery, setSearchQuery] = useState("");

  const { songs, snapshot } = selectedSnapshotData;

  // Calculate ratings and sort by highest rating first
  const { newSongsB15, oldSongsB35, newSongsRemaining, oldSongsRemaining } = splitSongs(songs, snapshot.gameVersion);

  const b50Songs = useMemo(() => [...newSongsB15, ...oldSongsB35], [newSongsB15, oldSongsB35]);

  const { data: percentileData } = trpc.user.getChartPercentiles.useQuery(
    {
      songs: b50Songs.map((s) => ({ publicSongId: s.songId, achievement: s.achievement })),
      userRating: snapshot.rating,
    },
    {
      enabled: !!(flags?.scorePercentile && b50Songs.length > 0 && snapshot.rating > 0),
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
    const filterSongs = (songList: SongWithRating[]) =>
      songList.filter(song =>
        song.songName.toLowerCase().includes(query) ||
        song.artist.toLowerCase().includes(query) ||
        song.difficulty.toLowerCase().includes(query) ||
        (song.levelPrecise / 10).toFixed(1).toLowerCase().includes(query) ||
        song.type.toLowerCase().includes(query)
      );

    return {
      newSongsB15: filterSongs(newSongsB15),
      oldSongsB35: filterSongs(oldSongsB35),
      newSongsRemaining: filterSongs(newSongsRemaining),
      oldSongsRemaining: filterSongs(oldSongsRemaining),
    };
  }, [searchQuery, newSongsB15, oldSongsB35, newSongsRemaining, oldSongsRemaining]);

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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <RatingChart songs={newSongsB15} title={t('dataContent.newSongsB15')} />
            <RatingChart songs={oldSongsB35} title={t('dataContent.oldSongsB35')} />
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
                <SongsGrid
                  newSongsB15={filteredData.newSongsB15}
                  oldSongsB35={filteredData.oldSongsB35}
                  remainingNewSongs={filteredData.newSongsRemaining}
                  remainingOldSongs={filteredData.oldSongsRemaining}
                  t={t}
                  b15Sum={b15Sum}
                  b15Average={b15Average}
                  b35Sum={b35Sum}
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
                  b15Sum={b15Sum}
                  b15Average={b15Average}
                  b35Sum={b35Sum}
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
