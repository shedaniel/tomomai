import { DbLayoutClient } from "@/components/db/db-layout-client";
import { SongDetailDrawer } from "@/components/db/song-detail-drawer";
import { getGameCatalogSections } from "@/lib/games/presentation";
import { getFrontendGame } from "@/lib/games/frontend-server";
import { supportsGameFeature } from "@/lib/games/frontend";
import type { ReactNode } from "react";
export default async function DbLayout({
  children,
  detail,
}: {
  children: ReactNode;
  detail: ReactNode;
}) {
  const game = getFrontendGame();
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
