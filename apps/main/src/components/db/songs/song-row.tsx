"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { CoverImage } from "@/components/cover-image";
import { UniqueSong } from "./types";
import { renderLevelPrecise } from "@/lib/name-utils";

interface SongRowProps {
  song: UniqueSong;
  index: number;
  isSelected: boolean;
  onSelect: (song: UniqueSong) => void;
}

export function SongRow({ song, index, isSelected, onSelect }: SongRowProps) {
  const href = `/db/songs/${encodeURIComponent(song.slug)}`;
  const isSingleDifficulty = song.difficulties.length === 1;
  const singleDiff = isSingleDifficulty ? song.difficulties[0] : null;

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    onSelect(song);
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{
        duration: 0.3,
        delay: Math.min(index * 0.008, 0.15),
        ease: [0.4, 0, 0.2, 1]
      }}
      layoutId={`song-row-${song.slug}${singleDiff ? `-${singleDiff.difficulty}` : ''}`}
    >
      <Link
        href={href}
        onClick={handleClick}
        className={cn(
          "flex items-center gap-3 py-2 px-2 rounded-lg hover:bg-muted/50 transition-colors",
          isSelected && "bg-violet-100 hover:bg-violet-100"
        )}
      >
        <CoverImage
          coverUrl={song.cover}
          alt={song.songName}
          className={cn(
            "w-10 h-10 rounded ring-2 ring-offset-2 ring-offset-background",
            !singleDiff && (song.type === "dx" ? "ring-amber-400" : "ring-slate-300"),
            singleDiff?.difficulty === "basic" && "ring-green-400",
            singleDiff?.difficulty === "advanced" && "ring-yellow-400",
            singleDiff?.difficulty === "expert" && "ring-red-400",
            singleDiff?.difficulty === "master" && "ring-purple-500",
            singleDiff?.difficulty === "remaster" && "ring-purple-200",
            singleDiff?.difficulty === "utage" && "ring-pink-400",
          )}
          width={40}
          height={40}
          loading="lazy"
        />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="font-medium truncate">{song.songName}</h2>
            <span className={cn(
              "text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0",
              song.type === "dx" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"
            )}>
              {song.type.toUpperCase()}
            </span>
            {singleDiff && (
              <span className={cn(
                "text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0",
                singleDiff.difficulty === "basic" && "bg-green-100 text-green-700",
                singleDiff.difficulty === "advanced" && "bg-yellow-100 text-yellow-700",
                singleDiff.difficulty === "expert" && "bg-red-100 text-red-700",
                singleDiff.difficulty === "master" && "bg-purple-100 text-purple-700",
                singleDiff.difficulty === "remaster" && "bg-purple-50 text-purple-900",
                singleDiff.difficulty === "utage" && "bg-pink-100 text-pink-700",
              )}>
                {singleDiff.difficulty.slice(0, 3).toUpperCase()} {renderLevelPrecise(singleDiff.levelPrecise, singleDiff.difficulty)}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate">
            {song.artist}
          </p>
        </div>
      </Link>
    </motion.div>
  );
}
