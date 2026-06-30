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
    // SongsList lives in the shared layout so it NEVER unmounts across
    // /db/songs ↔ /db/songs/[slug]. It takes no `initialSongs` prop: the
    // catalog is fetched client-side via tRPC (1h cache). Passing the catalog
    // as a prop would serialize it into this layout's RSC segment, which is
    // shared with the detail route — recreating the ISR cost problem. The
    // list route renders its own SSR <ul> of song links for crawlers; this
    // component hides it once its interactive grid hydrates.
    return (
      <>
        <SongsList />
        {children}
      </>
    );
  }

  return <>{children}</>;
}
