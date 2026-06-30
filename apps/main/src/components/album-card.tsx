"use client";

import { trpc } from "@/lib/trpc-client";
import { Region } from "@/lib/types";
import { cn, createSafeMaimaiImageUrl, getTypeBadgeUrl } from "@/lib/utils";
import { Images, Loader2, AlertCircle, Calendar, MapPin, Music, HardDrive, Info, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { AlbumCardSkeleton } from "./album-card.skeleton";

import { CoverImage } from "@/components/cover-image";
import { useState, useEffect, useRef, useCallback } from "react";
import { inferRouterOutputs } from "@trpc/server";
import { AppRouter } from "@/server/routers/_app";
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll";
import { renderLevelPrecise } from "@/lib/name-utils";
import { Button } from "@tomomai/ui";
import {
  ResponsiveDialog,
  ResponsiveDialogClose,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogTrigger,
} from "@tomomai/ui";
import { Checkbox } from "@/components/animate-ui/components/radix/checkbox";
import { toast } from "sonner";

interface AlbumCardProps {
  region: Region;
}

export function AlbumCard({ region }: AlbumCardProps) {
  const regionsT = useTranslations('regions');
  const t = useTranslations('albums');
  const [albums, setAlbums] = useState<inferRouterOutputs<AppRouter>['user']['getUserAlbums']['albums']>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const limit = 20;

  const processedOffsetsRef = useRef<Set<number>>(new Set());

  const { data, isLoading, isFetching, error } = trpc.user.getUserAlbums.useQuery({
    region,
    limit,
    offset,
  });

  useEffect(() => {
    setOffset(0);
    setAlbums([]);
    setHasMore(true);
    processedOffsetsRef.current = new Set();
  }, [region]);

  useEffect(() => {
    if (data && !isFetching && !processedOffsetsRef.current.has(offset)) {
      processedOffsetsRef.current.add(offset);
      if (offset === 0) {
        setAlbums(data.albums);
      } else {
        setAlbums(prev => [...prev, ...data.albums]);
      }
      setHasMore(data.hasMore);
    }
  }, [data, offset, isFetching]);

  const loadMore = useCallback(() => {
    if (hasMore && !isFetching) {
      setOffset(prev => prev + limit);
    }
  }, [hasMore, isFetching]);

  const sentinelRef = useInfiniteScroll(loadMore, hasMore && !isFetching);

  const [albumToDelete, setAlbumToDelete] = useState<string | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [dontAskAgain, setDontAskAgain] = useState(false);

  const skipConfirmKey = "album-delete-skip-confirm";

  const utils = trpc.useUtils();

  const deleteAlbumMutation = trpc.user.deleteAlbum.useMutation({
    onSuccess: (_data, variables) => {
      setAlbums(prev => prev.filter(a => a.id !== variables.albumId));
      utils.user.getUserAlbums.invalidate();
      toast.success(t('deleteSuccess'));
    },
    onError: () => {
      toast.error(t('deleteFailed'));
    },
  });

  const handleDeleteClick = (albumId: string) => {
    const skipDate = localStorage.getItem(skipConfirmKey);
    const today = new Date().toISOString().split('T')[0];
    if (skipDate === today) {
      deleteAlbumMutation.mutate({ albumId });
    } else {
      setAlbumToDelete(albumId);
      setDontAskAgain(false);
      setShowDialog(true);
    }
  };

  const handleConfirmDelete = () => {
    if (dontAskAgain) {
      const today = new Date().toISOString().split('T')[0];
      localStorage.setItem(skipConfirmKey, today);
    }
    if (albumToDelete) {
      deleteAlbumMutation.mutate({ albumId: albumToDelete });
    }
    setShowDialog(false);
    setAlbumToDelete(null);
  };

  if (isLoading && offset === 0) {
    return <AlbumCardSkeleton />;
  }

  if (error) {
    return (
      <div className="space-y-6">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Images className="h-5 w-5" />
          {t('title')}
        </h2>
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <AlertCircle className="h-5 w-5 mr-2" />
          <span>{t('error')}</span>
        </div>
      </div>
    );
  }

  if (albums.length === 0 && !isLoading && processedOffsetsRef.current.has(0)) {
    return (
      <div className="space-y-6">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Images className="h-5 w-5" />
          {t('title')}
        </h2>
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <span>{t('noAlbums')}</span>
        </div>
      </div>
    );
  }

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Images className="h-5 w-5" />
          {t('title')}
        </h2>
          <div className="flex items-center gap-3">
            {data?.storage && (
              <ResponsiveDialog>
                <ResponsiveDialogTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2">
                    <HardDrive className="h-4 w-4" />
                    <span className="hidden sm:inline">{t('storage')}</span>
                  </Button>
                </ResponsiveDialogTrigger>
                <ResponsiveDialogContent>
                  <ResponsiveDialogHeader>
                    <ResponsiveDialogTitle>{t('storageTitle')}</ResponsiveDialogTitle>
                    <ResponsiveDialogDescription>
                      {t('storageDescription')}
                    </ResponsiveDialogDescription>
                  </ResponsiveDialogHeader>
                  <div className="space-y-4">
                    {/* Total Storage with Stacked Progress Bar */}
                    <div className="space-y-3">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">{t('totalUsed')}</span>
                        <span className="font-medium">
                          {formatBytes(data.storage.used)} {t('usedOf')} {formatBytes(data.storage.limit)}
                        </span>
                      </div>

                      {/* Custom Stacked Progress Bar */}
                      <div className="relative h-3 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="absolute left-0 top-0 h-full bg-blue-500 transition-all"
                          style={{ width: `${Math.min(data.storage.intlPercentage, 100)}%` }}
                        />
                        <div
                          className="absolute top-0 h-full bg-red-500 transition-all"
                          style={{
                            left: `${Math.min(data.storage.intlPercentage, 100)}%`,
                            width: `${Math.min(data.storage.jpPercentage, 100 - data.storage.intlPercentage)}%`
                          }}
                        />
                      </div>

                      {/* Legend */}
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-1.5">
                            <span className="w-3 h-3 rounded-full bg-blue-500"></span>
                            <span className="text-muted-foreground">{regionsT('intl')}</span>
                            <span className="font-medium">{formatBytes(data.storage.intlUsed)}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="w-3 h-3 rounded-full bg-red-500"></span>
                            <span className="text-muted-foreground">{regionsT('jp')}</span>
                            <span className="font-medium">{formatBytes(data.storage.jpUsed)}</span>
                          </div>
                        </div>
                        <span className="text-muted-foreground">
                          {data.storage.percentage.toFixed(1)}%
                        </span>
                      </div>
                    </div>

                    {data.storage.percentage > 80 && (
                      <div className="flex gap-2 p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-md">
                        <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-500 mt-0.5 shrink-0" />
                        <p className="text-sm text-red-800 dark:text-red-200">
                          {t('storageWarning')}
                        </p>
                      </div>
                    )}
                  </div>
                </ResponsiveDialogContent>
              </ResponsiveDialog>
            )}
            {albums.length > 0 && (
              <span className="text-sm font-normal text-muted-foreground">
                {albums.length} {t('photos')}
              </span>
            )}
          </div>
      </div>
      <div>
        {/* Upload Notice Banner */}
        <div className="mb-4 flex gap-2 p-3 bg-neutral-50 dark:bg-neutral-700/20 border border-neutral-200 dark:border-neutral-600 rounded-md">
          <Info className="h-4 w-4 text-neutral-600 dark:text-neutral-400 mt-0.5 shrink-0" />
          <p className="text-sm text-neutral-800 dark:text-neutral-200">
            {t('uploadNotice')}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {albums.map((album) => {
            const takenAt = new Date(album.takenAt);

            return (
              <div
                key={album.id}
                className="flex flex-col gap-3 p-4 border rounded-lg hover:bg-muted/50 transition-colors"
              >
                {/* Album Image - 16:9 aspect ratio */}
                <div className="relative w-full aspect-video overflow-hidden bg-muted">
                  <img
                    src={`${process.env.NEXT_PUBLIC_R2_URL}/${album.imageKey}`}
                    alt={album.songName}
                    className="w-full h-full object-cover"
                  />
                </div>

                {/* Album Info */}
                <div className="flex gap-3">
                  {/* Song Cover */}
                  <div className="relative shrink-0 m-1">
                    <CoverImage
                      coverUrl={album.cover}
                      alt={album.songName}
                      className={cn(
                        "w-14 h-14 rounded ring-2 ring-offset-2 ring-offset-background object-cover",
                        album.difficulty === "basic" && "ring-green-400",
                        album.difficulty === "advanced" && "ring-yellow-400",
                        album.difficulty === "expert" && "ring-red-400",
                        album.difficulty === "master" && "ring-purple-500",
                        album.difficulty === "remaster" && "ring-purple-200",
                      )}
                      width={56}
                      height={56}
                      loading="lazy"
                    />
                    <div
                      className={cn(
                        "absolute top-12 -right-1 px-1.5 py-0.5 rounded rounded-tr-none rounded-br-[8px] text-xs font-semibold text-white",
                        album.difficulty === "basic" && "bg-green-400",
                        album.difficulty === "advanced" && "bg-yellow-400",
                        album.difficulty === "expert" && "bg-red-400",
                        album.difficulty === "master" && "bg-purple-500",
                        album.difficulty === "remaster" && "bg-purple-200 text-purple-900",
                      )}
                    >
                      {renderLevelPrecise(album.levelPrecise, album.difficulty)}
                    </div>
                  </div>

                  {/* Song Details */}
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold truncate">{album.songName}</h4>
                    <p className="text-xs text-muted-foreground truncate">{album.artist}</p>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <img
                        src={createSafeMaimaiImageUrl(getTypeBadgeUrl(album.type))}
                        alt={album.type.toUpperCase()}
                        width={32}
                        height={10}
                        className="h-2.5 w-auto"
                      />
                    </div>
                  </div>
                </div>

                {/* Metadata */}
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      <span>{takenAt.toLocaleDateString()} {takenAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    {album.venue && (
                      <div className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        <span className="truncate max-w-[200px]">{album.venue}</span>
                      </div>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => handleDeleteClick(album.id)}
                    disabled={deleteAlbumMutation.isPending}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}

          {/* Infinite scroll sentinel */}
          {hasMore && (
            <div ref={sentinelRef} className="col-span-full flex justify-center py-4">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}
        </div>
      </div>

      <ResponsiveDialog open={showDialog} onOpenChange={setShowDialog}>
        <ResponsiveDialogContent showCloseButton={false}>
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>{t('deleteTitle')}</ResponsiveDialogTitle>
            <ResponsiveDialogDescription>
              {t('deleteDescription')}
            </ResponsiveDialogDescription>
          </ResponsiveDialogHeader>
          <div className="flex items-center gap-2">
            <Checkbox
              id="dont-ask-again"
              checked={dontAskAgain}
              onCheckedChange={(checked) => setDontAskAgain(checked === true)}
            />
            <label htmlFor="dont-ask-again" className="text-sm cursor-pointer select-none">
              {t('dontAskAgain')}
            </label>
          </div>
          <ResponsiveDialogFooter>
            <ResponsiveDialogClose asChild>
              <Button variant="outline">{t('cancel')}</Button>
            </ResponsiveDialogClose>
            <Button onClick={handleConfirmDelete}>{t('delete')}</Button>
          </ResponsiveDialogFooter>
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    </div>
  );
}
