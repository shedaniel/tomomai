"use client";

import { Slot } from "@radix-ui/react-slot";
import { useSongDetail } from "@/components/db/songs/song-detail-provider";
import type { ScoreHoverProps } from "./registry";

/** A score that opens its song's details in place when clicked, for games without a hover card. */
export function SongDetailOnClick({ score, children }: ScoreHoverProps) {
  const { openSongDetail } = useSongDetail();
  return (
    <Slot
      role="button"
      tabIndex={0}
      onClick={() => openSongDetail({ publicId: score.songId })}
      onKeyDown={event => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        openSongDetail({ publicId: score.songId });
      }}
    >
      {children}
    </Slot>
  );
}
