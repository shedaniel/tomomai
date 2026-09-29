"use client";

import { motion } from "motion/react";
import { Link } from "@/i18n/navigation"

import { cn, createSafeMaimaiImageUrl } from "@/lib/utils";
import { CoverImage } from "@/components/cover-image";
import { UniqueSong } from "./types";
import { useGameId } from "@/components/providers/game-provider";
import { codeOf } from "@/lib/games/codes";
import { formatGameLevel, getGameDifficulty, getGameChartType, getGameChartTypeBadge } from "@/lib/games/presentation";

interface SongCardProps {
  song: UniqueSong;
  index: number;
  isSelected: boolean;
  onSelect: (song: UniqueSong) => void;
  /** Skip the entrance animation on first mount (set by the list). */
  disableInitialAnimation?: boolean;
}

export function SongCard({ song, index, isSelected, onSelect, disableInitialAnimation }: SongCardProps) {
  const game = useGameId();
  const href = `/db/songs/${encodeURIComponent(song.slug)}`;

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    onSelect(song);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLAnchorElement>) => {
    const card = e.currentTarget;
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const percentX = (x - centerX) / centerX;
    const percentY = -((y - centerY) / centerY);

    card.style.transform = `perspective(1000px) rotateY(${percentX * 6}deg) rotateX(${percentY * 6}deg) scale3d(1.02, 1.02, 1.02)`;

    const glow = card.querySelector('.song-card-glow') as HTMLElement;
    if (glow) {
      glow.style.opacity = '1';
      glow.style.background = `
        radial-gradient(
          circle at ${x}px ${y}px,
          rgba(255, 255, 255, 0.2),
          rgba(255, 255, 255, 0.1),
          transparent
        )
      `;
    }
  };

  const handleMouseLeave = (e: React.MouseEvent<HTMLAnchorElement>) => {
    const card = e.currentTarget;
    card.style.transform = 'perspective(1000px) rotateY(0deg) rotateX(0deg) scale3d(1, 1, 1)';

    const glow = card.querySelector('.song-card-glow') as HTMLElement;
    if (glow) {
      glow.style.opacity = '0';
    }
  };

  const isSingleDifficulty = song.difficulties.length === 1;
  const singleDiff = isSingleDifficulty ? song.difficulties[0] : null;
  const typeCode = codeOf(game, "chartType", song.type);
  const chartType = getGameChartType(game, typeCode);
  const typeBadge = getGameChartTypeBadge(game, typeCode);
  const difficultyCode = singleDiff ? codeOf(game, "difficulty", singleDiff.difficulty) : null;

  return (
    <motion.div
      initial={disableInitialAnimation ? false : { opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.4,
        delay: Math.min(index * 0.015, 0.25),
        ease: [0.4, 0, 0.2, 1]
      }}
      layoutId={`song-card-${song.slug}${singleDiff ? `-${singleDiff.difficulty}` : ''}`}
    >
      <Link
        href={href}
        onClick={handleClick}
        className={cn(
          "block relative rounded-md overflow-hidden cursor-pointer ring-2 transition-all duration-300 ease-out",
          difficultyCode === null ? chartType.classes.ring : getGameDifficulty(game, difficultyCode).classes.ring,
          isSelected && "ring-4 ring-violet-500"
        )}
        style={{ aspectRatio: '1/1', transformStyle: 'preserve-3d', transform: 'perspective(1000px)' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        <CoverImage
          coverUrl={song.cover}
          alt={song.songName}
          fill
          className="object-cover"
          loading="lazy"
          sizes="(min-width: 1280px) 12.5vw, (min-width: 1024px) 14.3vw, (min-width: 768px) 16.7vw, (min-width: 640px) 20vw, (min-width: 475px) 25vw, 33.3vw"
        />

        {/* Dark overlay */}
        <div className="absolute inset-0 bg-linear-to-t from-black/90 via-black/40 to-transparent rounded-md overflow-hidden" />

        {/* Type Badge */}
        {!chartType.implicit && <div className="absolute top-2 left-2 z-10">
          {typeBadge ? <img
            src={createSafeMaimaiImageUrl(typeBadge)}
            alt={chartType.label}
            width={32}
            height={10}
            className="drop-shadow-md"
            loading="lazy"
          /> : <span className="rounded bg-background/90 px-1 text-xs text-foreground">{chartType.label}</span>}
        </div>}

        {/* Difficulty Badge (only if single difficulty) */}
        {singleDiff && difficultyCode !== null && (
          <div className={cn(
            "absolute top-[-2px] right-[-2px] pl-1.75 pr-3 py-0.75 rounded-tr-md rounded-bl-[8px] overflow-hidden text-[10px] font-semibold text-white z-10",
            getGameDifficulty(game, difficultyCode).classes.cardBadge,
          )}>
            {singleDiff.levelPreciseEstimated ? "≈" : ""}{formatGameLevel(game, singleDiff.levelPrecise, difficultyCode)}
          </div>
        )}

        {/* Glow Effect */}
        <div className="song-card-glow absolute inset-[-2px] opacity-0 transition-opacity duration-300 pointer-events-none rounded-md overflow-hidden" />

        {/* Song Info */}
        <div className="absolute bottom-0 left-0 right-0 p-2.5 text-white">
          <h2 className="text-sm font-semibold truncate mb-0.5 drop-shadow-md">
            {song.songName}
          </h2>
          <p className="text-[11px] text-white/80 truncate drop-shadow-md">
            {song.artist}
          </p>
        </div>
      </Link>
    </motion.div>
  );
}
