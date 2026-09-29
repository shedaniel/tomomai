"use client";

import { forwardRef } from "react";
import { useGameId } from "@/components/providers/game-provider";
import { CoverImage } from "@/components/cover-image";
import { formatGameScore, formatGameRating, formatGameLevel, getGameDifficultyColors, getGameDifficultyLabel, getGameChartTypeBadgeLabel, getGameStatusLabels } from "@/lib/games/presentation";
import type { PercentileEntry } from "@/lib/games/maimai/percentile/types";
import { cn } from "@/lib/utils";
import { ScoreHover } from "./score-hover";
import type { RatedScore } from "./types";

// Component for rendering individual song rows
export const SongRow = forwardRef<HTMLDivElement, { song: RatedScore; percentile?: PercentileEntry } & React.HTMLAttributes<HTMLDivElement>>(({ song, percentile, ...props }, ref) => {
  const game = useGameId();
  return (
    <ScoreHover song={song} percentile={percentile ? { ...percentile, userAchievement: song.scoreValue } : undefined}>
      <div ref={ref} {...props} className={cn("group relative isolate flex justify-between items-center text-sm border-b border-dashed border-border pb-1.5 h-12 px-2 -mx-2 cursor-pointer", props.className)}>
        <div className="absolute inset-x-0 -top-1.5 bottom-0 rounded-md group-hover:bg-muted/50 transition-colors -z-10" />
        <CoverImage coverUrl={song.cover}
          alt={song.songName}
          className={cn(
            "w-8 h-8 ml-1 mr-3 rounded ring-2 ring-offset-2 ring-offset-background",
            getGameDifficultyColors(game, song.difficultyCode).ring,
          )}
          width={36}
          height={36}
          loading="lazy"
          sizes="32px"
        />
        <div className="flex-1 min-w-0">
          <div className="truncate font-medium">{song.songName}&#8203;</div>
          <div className="text-muted-foreground text-xs truncate">{getGameChartTypeBadgeLabel(game, song.typeCode) && <>{getGameChartTypeBadgeLabel(game, song.typeCode)} • </>}{getGameDifficultyLabel(game, song.difficultyCode)} {formatGameLevel(game, song.levelPrecise, song.difficultyCode)} • {song.artist}</div>
        </div>
        <div className="text-right ml-2">
          <div className="font-mono">{formatGameScore(game, song.scoreValue)}</div>
          <div className="text-xs text-muted-foreground">{getGameStatusLabels(game, song).join(" ")}&#8203;</div>
        </div>
        <div className="text-right ml-4 mr-2">
          <div className="font-mono text-md font-semibold">{formatGameRating(game, song.rating)}</div>
        </div>
      </div>
    </ScoreHover>
  );
});
SongRow.displayName = "SongRow";
