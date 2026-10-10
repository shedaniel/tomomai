"use client";

import type { RecentPlay } from "@/lib/trpc-types";
import { formatGameScore, formatGameLevel, getGameDifficulty, getGameStatusLabels } from "@/lib/games/presentation";
import { hasPlaylog } from "@/lib/games/recent-details";
import { useGame } from "@/components/providers/game-provider";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp, CloudOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Badge } from "@tomomai/ui";
import { AutoHeight } from "@/components/animate-ui/primitives/effects/auto-height";
import { CoverImage } from "@/components/cover-image";
import { ChartTypeBadge } from "@/components/games/chart-type-badge";
import { RecentPlaylog } from "@/components/games/registry";
import { ExpandedSongDetails } from "@/components/player/expanded-song-details";
import { motion } from "motion/react";
import { STAGGER, getTransition } from "@/lib/animation-constants";
import { useMediaQuery } from "@/hooks/use-media-query";

interface RecentPlayRowProps {
  play: RecentPlay;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  onToggleExpand: (id: string) => void;
  isExpanded: boolean;
}

export function RecentPlayRow({ play, index, isFirst, isLast, onToggleExpand, isExpanded }: RecentPlayRowProps) {
  const game = useGame().id;
  const t = useTranslations('recentPlays');
  const isDesktop = useMediaQuery("(min-width: 768px)", { initializeWithValue: false });
  const [isRowHovered, setIsRowHovered] = useState(false);
  const { details } = play;
  const isFetched = hasPlaylog(details);
  const playDate = new Date(play.playedAt);
  const difficulty = getGameDifficulty(game, play.difficultyCode);
  const statusLabels = getGameStatusLabels(game, play);

  return (
    <motion.div
      key={play.recentSongId}
      onClick={() => onToggleExpand(play.recentSongId.toString())}
      onHoverStart={() => setIsRowHovered(true)}
      onHoverEnd={() => setIsRowHovered(false)}
      className={cn("flex flex-col transition-colors cursor-pointer group",
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
            {!isFetched && (
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
          {statusLabels.length > 0 ? (
            <motion.div
              className="text-xs text-muted-foreground"
              animate={isRowHovered ? {
                scale: 1.05,
              } : {
                scale: 1,
              }}
              transition={getTransition({ type: 'spring', stiffness: 500, damping: 20 })}
            >
              {statusLabels.join(" ")}
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
      <button type="button" aria-expanded={isExpanded} className="flex w-full items-center justify-center gap-1 text-xs text-muted-foreground mt-4 md:mt-2">
        {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        <span>{t(isExpanded ? 'clickToCollapse' : 'clickToExpand')}</span>
      </button>

      <AutoHeight deps={[isExpanded]}>
        <div className={cn(!isExpanded && "max-h-0")}>
          <div className="h-6" />
          {isFetched ? <RecentPlaylog details={details} play={play} /> : <PlaylogNotFetched />}
          <ExpandedSongDetails publicId={play.songId} />
        </div>
      </AutoHeight>
    </motion.div>
  );
}

function PlaylogNotFetched() {
  const t = useTranslations('recentPlays');
  return (
    <div className="px-4 rounded-md bg-muted/50 text-center">
      <div className="h-6" />
      <CloudOff className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">
        {t('detailsNotFetched')}
      </p>
      <div className="h-6" />
    </div>
  );
}
