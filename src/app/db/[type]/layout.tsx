import { SongsList } from "@/components/db/songs-list";
import { SongsListNoSSR } from "@/components/db/songs-list-no-ssr";
import { getAllUniqueSongsCached } from "@/server/queries/songs-cache";
import { headers } from "next/headers";
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

// Persistent layout for /db/[type]/* routes. For type=songs we mount
// <SongsList/> here (above the [slug] page boundary) so the catalog stays
// mounted across /db/songs ↔ /db/songs/[slug] navigation — scroll
// position, filters, search, and grouping all survive opening/closing the
// drawer. The {children} slot still renders below for JSON-LD and any
// type-specific page content.
//
// On detail pages (/db/songs/[slug]) we skip SSR for the list via
// SongsListNoSSR so crawlers don't receive duplicate song-name headings
// on every detail page — they should only appear on the canonical list page.
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
    const hdrs = await headers();
    const pathname = hdrs.get("x-pathname") ?? "";
    const isDetailPage = /^\/db\/songs\/.+/.test(pathname);
    return (
      <>
        {isDetailPage
          ? <SongsListNoSSR initialSongs={songs} />
          : <SongsList initialSongs={songs} />
        }
        {children}
      </>
    );
  }

  return <>{children}</>;
}
