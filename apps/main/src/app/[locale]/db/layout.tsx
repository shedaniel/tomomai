import { DbLayoutClient } from "@/components/db/db-layout-client";
import { SongDetailDrawer } from "@/components/db/song-detail-drawer";
import { getGameCatalogSections } from "@/lib/games/presentation";
import { getCurrentGame } from "@/lib/games/current";
import { supportsGameFeature } from "@/lib/games/frontend";
import type { ReactNode } from "react";
export default async function DbLayout({
  children,
  detail,
}: {
  children: ReactNode;
  detail: ReactNode;
}) {
  const game = getCurrentGame();
  const types = supportsGameFeature(game, "catalog") ? getGameCatalogSections(game.id) : [];
  return (
    <>
      <DbLayoutClient types={types} user={null} customThemesEnabled={false}>
        {children}
      </DbLayoutClient>
      <SongDetailDrawer>{detail}</SongDetailDrawer>
    </>
  );
}
