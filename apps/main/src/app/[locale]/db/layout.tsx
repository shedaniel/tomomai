import { DbLayoutClient } from "@/components/db/db-layout-client";
import { SongDetailDrawer } from "@/components/db/song-detail-drawer";
import { getCurrentGame } from "@/lib/games/current";
import { navCatalogSections } from "@/lib/games/frontend";
import type { ReactNode } from "react";
export default async function DbLayout({
  children,
  detail,
}: {
  children: ReactNode;
  detail: ReactNode;
}) {
  return (
    <>
      <DbLayoutClient types={navCatalogSections(getCurrentGame())} user={null} customThemesEnabled={false}>
        {children}
      </DbLayoutClient>
      <SongDetailDrawer>{detail}</SongDetailDrawer>
    </>
  );
}
