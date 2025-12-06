"use client";

import { motion } from "motion/react";
import Link from "next/link";
import Image from "next/image";
import { cn, createSafeMaimaiImageUrl } from "@/lib/utils";
import { UniqueSong } from "./types";
import { renderLevelPrecise } from "@/lib/name-utils";

interface SongCardProps {
  song: UniqueSong;
  index: number;
  isSelected: boolean;
  onSelect: (song: UniqueSong) => void;
}

export function SongCard({ song, index, isSelected, onSelect }: SongCardProps) {
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

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
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
          !singleDiff && (song.type === "dx" ? "ring-amber-400 dark:ring-amber-300/75" : "ring-slate-300 dark:ring-slate-300/75"),
          singleDiff?.difficulty === "basic" && "ring-green-400 dark:ring-green-600",
          singleDiff?.difficulty === "advanced" && "ring-yellow-400 dark:ring-yellow-600",
          singleDiff?.difficulty === "expert" && "ring-red-400 dark:ring-red-600",
          singleDiff?.difficulty === "master" && "ring-purple-500 dark:ring-purple-600",
          singleDiff?.difficulty === "remaster" && "ring-purple-200 dark:ring-purple-400",
          singleDiff?.difficulty === "utage" && "ring-pink-400 dark:ring-pink-600",
          isSelected && "ring-4 ring-violet-500"
        )}
        style={{ aspectRatio: '1/1', transformStyle: 'preserve-3d', transform: 'perspective(1000px)' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        <Image
          src={createSafeMaimaiImageUrl(song.cover)}
          alt={song.songName}
          fill
          className="object-cover"
          loading="lazy"
        />

        {/* Dark overlay */}
        <div className="absolute inset-0 bg-linear-to-t from-black/90 via-black/40 to-transparent rounded-md overflow-hidden" />

        {/* Type Badge */}
        <div className="absolute top-2 left-2 z-10">
          <Image
            src={createSafeMaimaiImageUrl(song.type === "dx"
              ? "https://maimaidx.jp/maimai-mobile/img/music_dx.png"
              : "https://maimaidx.jp/maimai-mobile/img/music_standard.png"
            )}
            alt={song.type.toUpperCase()}
            width={32}
            height={10}
            className="drop-shadow-md"
            loading="lazy"
          />
        </div>

        {/* Difficulty Badge (only if single difficulty) */}
        {singleDiff && (
          <div className={cn(
            "absolute top-[-2px] right-[-2px] pl-1.75 pr-3 py-0.75 rounded-tr-md rounded-bl-[8px] overflow-hidden text-[10px] font-semibold text-white z-10",
            singleDiff.difficulty === "basic" && "bg-green-500 dark:bg-green-600",
            singleDiff.difficulty === "advanced" && "bg-yellow-500 dark:bg-yellow-600",
            singleDiff.difficulty === "expert" && "bg-red-500 dark:bg-red-600",
            singleDiff.difficulty === "master" && "bg-purple-500 dark:bg-purple-600",
            singleDiff.difficulty === "remaster" && "bg-purple-200 text-purple-900 dark:bg-purple-400 dark:text-purple-900",
            singleDiff.difficulty === "utage" && "bg-pink-500 dark:bg-pink-600",
          )}>
            {renderLevelPrecise(singleDiff.levelPrecise, singleDiff.difficulty)}
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

