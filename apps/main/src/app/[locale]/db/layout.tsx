import { DbLayoutClient } from "@/components/db/db-layout-client";
import { SongDetailDrawer } from "@/components/db/song-detail-drawer";
import { getCurrentGame } from "@/lib/games/current";
import { getGame } from "@/lib/games/registry";
import type { ReactNode } from "react";
export default async function DbLayout({
  children,
  detail,
}: {
  children: ReactNode;
  detail: ReactNode;
}) {
  const game = getCurrentGame();
  const types = getGame(game.id).catalogSections;
  return (
    <>
      <DbLayoutClient types={types} user={null} customThemesEnabled={false}>
        {children}
      </DbLayoutClient>
      <SongDetailDrawer>{detail}</SongDetailDrawer>
    </>
  );
}
