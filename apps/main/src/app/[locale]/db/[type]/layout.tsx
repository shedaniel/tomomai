import { SongsList } from "@/components/db/songs-list";
import { getAllUniqueSongsCached } from "@/server/queries/songs-cache";
import type { ReactNode } from "react";

export default async function DbTypeLayout({
  params,
  children,
}: {
  params: Promise<{ type: string }>;
  children: ReactNode;
}) {
  const { type } = await params;

  if (type === "songs") {
    const songs = await getAllUniqueSongsCached();
    return (
      <>
        <SongsList initialSongs={songs} />
        {children}
      </>
    );
  }

  return <>{children}</>;
}
