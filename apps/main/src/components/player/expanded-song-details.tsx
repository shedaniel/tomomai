"use client";

import { useGameId } from "@/components/providers/game-provider";
import { trpc } from "@/lib/trpc-client";
import { Activity, Calendar, ChevronRight, Loader2, Music } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Button } from "@tomomai/ui";
import { Separator } from "@tomomai/ui";
import { getVersion } from "@/lib/games/versions";
import { motion } from "motion/react";
import { SPRING_CONFIGS, getTransition } from "@/lib/animation-constants";

export function ExpandedSongDetails({ publicId }: { publicId: string }) {
  const t = useTranslations();
  const game = useGameId();
  const { data: songDetails, isLoading } = trpc.user.getSimpleSongDetails.useQuery(
    { game, publicId },
    {
      staleTime: 1000 * 60 * 60, // 1 hour
    }
  );

  const addedVersionInfo = songDetails ? getVersion(game, songDetails.addedVersion) : null;

  return (
    <div className="mt-4 flex flex-col gap-3">
      <Separator />
      <div className="grid grid-cols-[auto_1fr] gap-4 text-xs">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Activity className="w-4 h-4" />
          <span>{t('db.songs.detail.bpm')}</span>
        </div>
        <div className="font-medium text-right">
          {isLoading ? (
            <div className="h-4 w-8 bg-muted animate-pulse rounded ml-auto" />
          ) : (
            songDetails?.bpm ?? "-"
          )}
        </div>

        <div className="flex items-center gap-2 text-muted-foreground">
          <Calendar className="w-4 h-4" />
          <span>{t('db.songs.detail.added')}</span>
        </div>
        <div className="font-medium text-right truncate">
          {isLoading ? (
            <div className="h-4 w-16 bg-muted animate-pulse rounded ml-auto" />
          ) : (
            addedVersionInfo?.name ?? (songDetails?.addedVersion ? `Ver. ${songDetails.addedVersion}` : "-")
          )}
        </div>
      </div>

      <motion.div
        whileHover={{ scale: 1.02, y: -2 }}
        whileTap={{ scale: 0.98 }}
        transition={getTransition(SPRING_CONFIGS.snappy)}
      >
        <Button
          className="w-full h-9 text-xs"
          variant="secondary"
          disabled={isLoading || !songDetails?.slug}
          asChild={!isLoading && !!songDetails?.slug}
        >
          {isLoading ? (
            <>
              <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
              {t('common.loading')}
            </>
          ) : songDetails?.slug ? (
            <Link href={`/db/songs/${songDetails.slug}`} target="_blank" className="relative">
              <Music className="w-3.5 h-3.5 mr-2" />
              {t('db.songs.detail.viewDetails')}
              <ChevronRight className="w-3.5 absolute top-0 bottom-0 right-2 my-auto" />
            </Link>
          ) : (
            <span className="text-destructive">Error</span>
          )}
        </Button>
      </motion.div>
    </div>
  );
}
