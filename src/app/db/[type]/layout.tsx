import { SongsList } from "@/components/db/songs-list";
import { getAllUniqueSongsCached } from "@/server/queries/songs-cache";
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

// Persistent layout for /db/[type]/* routes. For type=songs we mount
// <SongsList/> here (above the [slug] page boundary) so the catalog stays
// mounted across /db/songs ↔ /db/songs/[slug] navigation — scroll
// position, filters, search, and grouping all survive opening/closing the
// drawer. The {children} slot still renders below for JSON-LD and any
// type-specific page content.
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
