import { DbLayoutClient } from "@/components/db/db-layout-client";
import { SongDetailDrawer } from "@/components/db/song-detail-drawer";
import { DB_TYPES } from "@/lib/db/types";
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
      <DbLayoutClient types={DB_TYPES} user={null} customThemesEnabled={false}>
        {children}
      </DbLayoutClient>
      <SongDetailDrawer>{detail}</SongDetailDrawer>
    </>
  );
}
