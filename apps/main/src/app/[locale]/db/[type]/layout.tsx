import { SongsListNoSSR } from "@/components/db/songs-list-no-ssr";
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
        <SongsListNoSSR initialSongs={songs} />
        {children}
      </>
    );
  }

  return <>{children}</>;
}
