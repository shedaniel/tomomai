import { DbLayoutClient } from "@/components/db/db-layout-client";
import { SongDetailDrawer } from "@/components/db/song-detail-drawer";
import { getServerSession } from "@/lib/auth-server";
import { useCustomThemes } from "@/lib/flags";
import { DB_TYPES } from "@/lib/db/types";
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

// `detail` is the @detail parallel-route slot. It's rendered as a sibling of
// DbLayoutClient (not as a descendant) so the drawer escapes the
// AnimatePresence/motion.div containing-block inside DbLayoutClient. Sitting
// at this level — directly in the layout's body output — also makes the
// drawer's inline (non-portal) rendering equivalent to a portal-to-body for
// positioning purposes, while keeping it visible to SSR.
export default async function DbLayout({
  children,
  detail,
}: {
  children: ReactNode;
  detail: ReactNode;
}) {
  const [session, customThemesEnabled] = await Promise.all([
    getServerSession(),
    useCustomThemes(),
  ]);

  return (
    <>
      <DbLayoutClient types={DB_TYPES} user={session?.user || null} customThemesEnabled={customThemesEnabled}>
        {children}
      </DbLayoutClient>
      <SongDetailDrawer>{detail}</SongDetailDrawer>
    </>
  );
}
