"use client";

import { forwardRef } from "react";
import { useGameId } from "@/components/providers/game-provider";
import { CoverImage } from "@/components/cover-image";
import { ChartTypeBadge } from "@/components/games/chart-type-badge";
import { formatGameScore, formatGameRating, formatGameLevel, getGameDifficulty, getGameStatusLabels } from "@/lib/games/presentation";
import type { PercentileEntry } from "@/lib/games/maimai/percentile/types";
import { cn } from "@/lib/utils";
import { GAME_UI } from "@/components/games/registry";
import type { DisplayScore } from "./types";

// Component for rendering individual song cards in grid view
export const SongGridCard = forwardRef<HTMLDivElement, { song: DisplayScore & { rating?: number }; percentile?: PercentileEntry } & React.HTMLAttributes<HTMLDivElement>>(({ song, percentile, ...props }, ref) => {
  const game = useGameId();
  const difficulty = getGameDifficulty(game, song.difficultyCode);
  const { ScoreHover } = GAME_UI[game];
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
    <ScoreHover score={song} side="right" percentile={percentile ? { ...percentile, userAchievement: song.scoreValue } : undefined}>
      <div
        ref={ref}
        {...props}
        className={cn("relative bg-white rounded-[8px] shadow-md transition-all duration-300 ease-out cursor-pointer ring-2",
          difficulty.classes.ring,
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
          sizes="(min-width: 1024px) 20vw, (min-width: 640px) 33.3vw, (min-width: 375px) 50vw, 100vw"
        />

        {/* Dark overlay for text readability */}
        <div className="absolute inset-0 bg-linear-to-t from-black/90 via-black/40 to-transparent rounded-[8px] overflow-hidden" />

        {/* Difficulty Badge */}
        <div className={cn(
          "absolute top-[-0.5px] right-[-0.5px] px-1.5 py-0.5 rounded-tr-[8px] rounded-bl-[8px] overflow-hidden text-[10px] font-semibold text-white",
          difficulty.classes.cardBadge,
        )}>
          {formatGameLevel(game, song.levelPrecise, song.difficultyCode)}
        </div>

        {/* Glow Effect */}
        <div className="song-card-glow absolute inset-[-2px] opacity-0 transition-opacity duration-300 pointer-events-none rounded-[8px] overflow-hidden" />

        <div className="song-card-content relative w-full h-full transition-transform duration-300"
          style={{ transform: 'translateZ(30px)' }}>
          {/* Song Type Badge */}
          <div className="absolute top-2.5 left-2.5 2xs:max-xs:left-2 2xs:max-xs:top-2 2xs:max-xs:scale-75 origin-top-left z-30">
            <ChartTypeBadge typeCode={song.typeCode} size="md" />
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
                  {formatGameScore(game, song.scoreValue)}
                </span>
                <span className="2xs:max-xs:text-[7px] text-[10px] opacity-75 drop-shadow-md whitespace-nowrap">
                  {getGameStatusLabels(game, song).join(" ")}
                </span>
              </div>
              <span className="2xs:max-xs:text-sm text-right text-lg font-bold font-mono drop-shadow-md leading-none align-bottom">
                {song.rating == null ? "" : formatGameRating(game, song.rating)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </ScoreHover>
  );
});
SongGridCard.displayName = "SongGridCard";
