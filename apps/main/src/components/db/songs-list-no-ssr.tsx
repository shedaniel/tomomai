"use client";

import dynamic from "next/dynamic";
import type { UniqueSong } from "./songs/types";

const SongsListDynamic = dynamic(
  () => import("@/components/db/songs-list").then((m) => m.SongsList),
  { ssr: false }
);

export function SongsListNoSSR({ initialSongs }: { initialSongs: UniqueSong[] }) {
  return <SongsListDynamic initialSongs={initialSongs} />;
}
