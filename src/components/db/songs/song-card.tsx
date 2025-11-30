"use client";

import { motion } from "motion/react";
import Link from "next/link";
import Image from "next/image";
import { cn, createSafeMaimaiImageUrl } from "@/lib/utils";
import { UniqueSong } from "./types";

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

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.4,
        delay: Math.min(index * 0.015, 0.25),
        ease: [0.4, 0, 0.2, 1]
      }}
      layoutId={`song-card-${song.slug}`}
    >
      <Link
        href={href}
        onClick={handleClick}
        className={cn(
          "block relative rounded-lg overflow-hidden cursor-pointer ring-2 transition-all duration-300 ease-out",
          song.type === "dx" ? "ring-amber-400" : "ring-slate-300",
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
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />

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

        {/* Glow Effect */}
        <div className="song-card-glow absolute -inset-2 opacity-0 transition-opacity duration-300 pointer-events-none rounded-lg" />

        {/* Song Info */}
        <div className="absolute bottom-0 left-0 right-0 p-2.5 text-white">
          <h3 className="text-sm font-semibold truncate mb-0.5 drop-shadow-md">
            {song.songName}
          </h3>
          <p className="text-[11px] text-white/80 truncate drop-shadow-md">
            {song.artist}
          </p>
        </div>
      </Link>
    </motion.div>
  );
}

