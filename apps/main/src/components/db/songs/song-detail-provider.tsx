"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Loader2, X } from "lucide-react";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { Button, Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@tomomai/ui";
import { usePathname } from "@/i18n/navigation";
import { useGame } from "@/components/providers/game-provider";
import { trpc } from "@/lib/trpc-client";
import { SongDetailContent } from "./song-detail-content";
import type { ChartTypeKey } from "./types";

type SongDetailContextValue = {
  /** Opens a song's details over the current page. `publicId` is a song instance ID or a chart's parent public ID. */
  openSongDetail: (target: { publicId: string }) => void;
};

const SongDetailContext = createContext<SongDetailContextValue | null>(null);

export function useSongDetail(): SongDetailContextValue {
  const context = useContext(SongDetailContext);
  if (!context) throw new Error("useSongDetail must be used inside SongDetailProvider");
  return context;
}

/** Lets any page show a song's database entry in place, without leaving the page. */
export function SongDetailProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [opened, setOpened] = useState<{ publicId: string; pathname: string } | null>(null);
  const openSongDetail = useCallback(({ publicId }: { publicId: string }) => setOpened({ publicId, pathname }), [pathname]);
  // Following a link out of the drawer closes it.
  const open = opened !== null && opened.pathname === pathname;
  const value = useMemo(() => ({ openSongDetail }), [openSongDetail]);

  return (
    <SongDetailContext.Provider value={value}>
      {children}
      <SongDetailDrawer publicId={opened?.publicId ?? null} open={open} onClose={() => setOpened(null)} />
    </SongDetailContext.Provider>
  );
}

function SongDetailDrawer({ publicId, open, onClose }: { publicId: string | null; open: boolean; onClose: () => void }) {
  const t = useTranslations();
  return (
    <Drawer open={open} onOpenChange={next => { if (!next) onClose(); }}>
      <DrawerContent className="mx-auto h-dvh max-h-[90dvh] w-[calc(min(100dvw-1rem,42rem))] bg-background shadow-2xl">
        <VisuallyHidden>
          <DrawerTitle>{t("db.songs.detail.title")}</DrawerTitle>
          <DrawerDescription>{t("db.songs.detail.artist")}</DrawerDescription>
        </VisuallyHidden>
        <div className="relative overflow-y-auto px-6 pb-8" style={{ scrollbarGutter: "stable" }}>
          <div className="absolute top-2 right-3 z-20">
            <Button variant="secondary" size="icon" className="h-8 w-8 rounded-full" onClick={onClose} aria-label={t("common.close")}>
              <X className="h-4 w-4 stroke-3 text-neutral-400" />
            </Button>
          </div>
          {publicId && <SongDetailById publicId={publicId} />}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function SongDetailById({ publicId }: { publicId: string }) {
  const t = useTranslations();
  const game = useGame();
  const { data: song, isLoading } = trpc.user.getSimpleSongDetails.useQuery({ game: game.id, publicId }, { staleTime: 60 * 60 * 1000 });
  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }
  if (!song) return <div className="py-20 text-center text-muted-foreground">{t("db.songs.detail.loadFailed")}</div>;
  return <SongDetailContent songName={song.songName} artist={song.artist} slug={song.slug} type={song.type as ChartTypeKey} showDatabaseLink />;
}
