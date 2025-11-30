"use client";

import { motion } from "motion/react";
import Link from "next/link";
import Image from "next/image";
import { cn, createSafeMaimaiImageUrl } from "@/lib/utils";
import { UniqueSong } from "./types";

interface SongRowProps {
  song: UniqueSong;
  index: number;
  isSelected: boolean;
  onSelect: (song: UniqueSong) => void;
}

export function SongRow({ song, index, isSelected, onSelect }: SongRowProps) {
  const href = `/db/songs/${encodeURIComponent(song.slug)}`;

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
      layoutId={`song-row-${song.slug}`}
    >
      <Link
        href={href}
        onClick={handleClick}
        className={cn(
          "flex items-center gap-3 py-2 px-2 rounded-lg hover:bg-muted/50 transition-colors",
          isSelected && "bg-violet-100 hover:bg-violet-100"
        )}
      >
        <Image
          src={createSafeMaimaiImageUrl(song.cover)}
          alt={song.songName}
          className={cn(
            "w-10 h-10 rounded ring-2 ring-offset-2 ring-offset-background",
            song.type === "dx" ? "ring-amber-400" : "ring-slate-300",
          )}
          width={40}
          height={40}
          loading="lazy"
        />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-medium truncate">{song.songName}</h3>
            <span className={cn(
              "text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0",
              song.type === "dx" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"
            )}>
              {song.type.toUpperCase()}
            </span>
          </div>
          <p className="text-xs text-muted-foreground truncate">
            {song.artist}
          </p>
        </div>
      </Link>
    </motion.div>
  );
}

