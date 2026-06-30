"use client";

import { Button } from "@tomomai/ui";
import { CANVAS_HEIGHT, CANVAS_WIDTH } from "@/lib/image-spec";
import { Region, SnapshotWithSongs } from "@/lib/types";
import { Download, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { Tabs, TabsList, TabsContents, TabsTrigger, TabsContent } from "@/components/animate-ui/components/radix/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@tomomai/ui/select-friendly";
import { trpc } from "@/lib/trpc-client";

interface ImagePanelProps {
  imageUrl: string;
  imageKey: number;
  isLoading: boolean;
  isDownloading: boolean;
  fileName: string;
  onRefresh: () => void;
  onRefreshFast?: () => void;
  onRefreshProfile?: () => void;
  onLoad: () => void;
}

function ImagePanel({
  imageUrl,
  imageKey,
  isLoading,
  isDownloading,
  fileName,
  onRefresh,
  onRefreshFast,
  onRefreshProfile,
  onLoad,
}: ImagePanelProps) {
  const [downloading, setDownloading] = useState(false);
  const [naturalRatio, setNaturalRatio] = useState<number | null>(null);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const isDev = process.env.NODE_ENV === 'development';

  const ratio = naturalRatio ?? CANVAS_WIDTH / CANVAS_HEIGHT;

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    if (img.naturalWidth > 0 && img.naturalHeight > 0) {
      setNaturalRatio(img.naturalWidth / img.naturalHeight);
    }
    onLoad();
  };

  const handleDownload = async () => {
    try {
      setDownloading(true);

      const response = await fetch(imageUrl);
      if (!response.ok) {
        throw new Error('Failed to fetch image');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();

      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to download image:', error);
      alert('Failed to download image. Please try again.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="flex flex-col items-center space-y-4 w-full min-w-0 mx-auto">
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button onClick={handleDownload} disabled={hydrated && (downloading || isLoading)} size="sm" className="flex items-center gap-2">
          {downloading ? (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          Download
        </Button>
        <Button onClick={onRefresh} variant="outline" size="sm" className="flex items-center gap-2">
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
        {isDev && onRefreshFast && (
          <Button onClick={onRefreshFast} variant="outline" size="sm" className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4" />
            Refresh (Fast)
          </Button>
        )}
        {isDev && onRefreshProfile && (
          <Button onClick={onRefreshProfile} variant="outline" size="sm" className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4" />
            Profile
          </Button>
        )}
      </div>
      <div
        className="border rounded-xl overflow-hidden shadow-sm relative"
        style={{
          aspectRatio: ratio,
          width: `min(100%, calc(80vh * ${ratio}))`,
        }}
      >
        {isLoading && (
          <div className="absolute inset-0 bg-muted animate-pulse">
            <div
              className="absolute inset-0 bg-gradient-to-r from-transparent via-muted-foreground/30 to-transparent animate-shimmer"
              style={{
                backgroundSize: '200% 100%',
                animation: 'shimmer 5s infinite',
              }}
            />
          </div>
        )}
        <img
          key={imageKey}
          src={imageUrl}
          alt={fileName}
          onLoad={handleImageLoad}
          className={isLoading ? 'opacity-0' : 'opacity-100 transition-opacity duration-600'}
          style={{
            width: '100%',
            height: '100%',
            display: 'block',
          }}
        />
      </div>
    </div>
  );
}

interface ExportImageCardProps {
  selectedSnapshotData: SnapshotWithSongs;
  region: Region;
  showLastCredit?: boolean;
  username?: string;
  /** Public snapshot publicId. When set, daily-plays days fetch uses the public tRPC procedure. */
  publicSnapshotId?: string;
}

function buildExportImageUrl(snapshotId: string, region: Region, username?: string, extra?: Record<string, string>) {
  const params = new URLSearchParams({ snapshotId });
  if (username) {
    params.set('username', username);
    params.set('region', region);
  }
  if (extra) {
    for (const [k, v] of Object.entries(extra)) params.set(k, v);
  }
  return `/api/export-image?${params.toString()}`;
}

function buildDailyPlaysUrl(snapshotId: string, region: Region, day: string | undefined, extra?: Record<string, string>) {
  const params = new URLSearchParams({ snapshotId, region });
  if (day) params.set('day', day);
  if (extra) {
    for (const [k, v] of Object.entries(extra)) params.set(k, v);
  }
  return `/api/daily-plays?${params.toString()}`;
}

function formatDayLabel(day: string, count: number, locale: string) {
  const date = new Date(`${day}T00:00:00+09:00`);
  const formatted = date.toLocaleDateString(locale, {
    year: 'numeric', month: 'short', day: 'numeric', weekday: 'short', timeZone: 'Asia/Tokyo',
  });
  return `${formatted} (${count})`;
}

export function ExportImageCard({ selectedSnapshotData, region, showLastCredit = true, username, publicSnapshotId }: ExportImageCardProps) {
  const t = useTranslations();

  const snapshotId = selectedSnapshotData.snapshot.id;

  // Export image state
  const [exportImageUrl, setExportImageUrl] = useState<string>(
    buildExportImageUrl(snapshotId, region, username)
  );
  const [exportImageKey, setExportImageKey] = useState(0);
  const [exportIsLoading, setExportIsLoading] = useState(true);

  // Last credit image state
  const [lastCreditImageUrl, setLastCreditImageUrl] = useState<string>(
    `/api/last-credit?region=${region}&beforeDate=${selectedSnapshotData.snapshot.fetchedAt.toISOString()}&snapshotId=${snapshotId}`
  );
  const [lastCreditImageKey, setLastCreditImageKey] = useState(0);
  const [lastCreditIsLoading, setLastCreditIsLoading] = useState(true);

  // Daily plays state
  const [selectedDay, setSelectedDay] = useState<string | undefined>(undefined);
  const [dailyImageKey, setDailyImageKey] = useState(0);
  const [dailyIsLoading, setDailyIsLoading] = useState(true);
  const [dailyUrlExtra, setDailyUrlExtra] = useState<Record<string, string>>({});

  const isPublic = !!publicSnapshotId;
  const ownDaysQuery = trpc.user.getDailyPlaysAvailableDays.useQuery(
    { region },
    { enabled: !isPublic },
  );
  const publicDaysQuery = trpc.user.getPublicDailyPlaysAvailableDays.useQuery(
    { snapshotId: publicSnapshotId!, region },
    { enabled: isPublic },
  );
  const availableDays = (isPublic ? publicDaysQuery.data : ownDaysQuery.data) ?? [];
  const daysLoading = (isPublic ? publicDaysQuery.isFetching : ownDaysQuery.isFetching) && availableDays.length === 0;

  useEffect(() => {
    setSelectedDay(undefined);
  }, [region, snapshotId]);

  useEffect(() => {
    if (!selectedDay && availableDays.length > 0) {
      setSelectedDay(availableDays[0].day);
    }
  }, [availableDays, selectedDay]);

  const dailyImageUrl = useMemo(
    () => buildDailyPlaysUrl(snapshotId, region, selectedDay, dailyUrlExtra),
    [snapshotId, region, selectedDay, dailyUrlExtra],
  );

  const handleExportRefresh = () => {
    setExportIsLoading(true);
    setExportImageKey(prev => prev + 1);
    setExportImageUrl(buildExportImageUrl(snapshotId, region, username, { t: Date.now().toString() }));
  };

  const handleExportRefreshFast = () => {
    setExportIsLoading(true);
    setExportImageKey(prev => prev + 1);
    setExportImageUrl(buildExportImageUrl(snapshotId, region, username, { scale: '1', t: Date.now().toString() }));
  };

  const handleExportRefreshProfile = () => {
    setExportIsLoading(true);
    setExportImageKey(prev => prev + 1);
    setExportImageUrl(buildExportImageUrl(snapshotId, region, username, { profile: '1', t: Date.now().toString() }));
  };

  const handleLastCreditRefresh = () => {
    setLastCreditIsLoading(true);
    setLastCreditImageKey(prev => prev + 1);
    setLastCreditImageUrl(`/api/last-credit?region=${region}&beforeDate=${selectedSnapshotData.snapshot.fetchedAt.toISOString()}&snapshotId=${snapshotId}&t=${Date.now()}`);
  };

  const handleLastCreditRefreshFast = () => {
    setLastCreditIsLoading(true);
    setLastCreditImageKey(prev => prev + 1);
    setLastCreditImageUrl(`/api/last-credit?region=${region}&beforeDate=${selectedSnapshotData.snapshot.fetchedAt.toISOString()}&snapshotId=${snapshotId}&scale=1&t=${Date.now()}`);
  };

  const handleDailyDayChange = (day: string) => {
    setSelectedDay(day);
    setDailyIsLoading(true);
    setDailyImageKey(prev => prev + 1);
    setDailyUrlExtra({});
  };

  const handleDailyRefresh = () => {
    setDailyIsLoading(true);
    setDailyImageKey(prev => prev + 1);
    setDailyUrlExtra({ t: Date.now().toString() });
  };

  const handleDailyRefreshFast = () => {
    setDailyIsLoading(true);
    setDailyImageKey(prev => prev + 1);
    setDailyUrlExtra({ scale: '1', t: Date.now().toString() });
  };

  const profilePanel = (
    <ImagePanel
      imageUrl={exportImageUrl}
      imageKey={exportImageKey}
      isLoading={exportIsLoading}
      isDownloading={false}
      fileName={`maimai-profile-${selectedSnapshotData.snapshot.displayName || 'export'}.png`}
      onRefresh={handleExportRefresh}
      onRefreshFast={handleExportRefreshFast}
      onRefreshProfile={handleExportRefreshProfile}
      onLoad={() => setExportIsLoading(false)}
    />
  );

  const locale = typeof window !== 'undefined' ? navigator.language : 'en-US';

  return (
    <div className="w-full mx-auto space-y-6">
      <h2 className="text-lg font-semibold flex items-center gap-2">
        <Download className="h-5 w-5" />
        {t('dataContent.tabs.exportImage')}
      </h2>

      {showLastCredit ? (
        <Tabs defaultValue="profile" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="profile">
              {t('dataContent.exportImageCard.profileImage')}
            </TabsTrigger>
            <TabsTrigger value="lastCredit">
              {t('dataContent.exportImageCard.lastCredit')}
            </TabsTrigger>
            <TabsTrigger value="daily">
              {t('dataContent.exportImageCard.dailyPlays')}
            </TabsTrigger>
          </TabsList>

          <TabsContents>
            <TabsContent value="profile" className="pt-4">
              {profilePanel}
            </TabsContent>
            <TabsContent value="lastCredit" className="pt-4">
              <ImagePanel
                imageUrl={lastCreditImageUrl}
                imageKey={lastCreditImageKey}
                isLoading={lastCreditIsLoading}
                isDownloading={false}
                fileName={`maimai-last-credit-${selectedSnapshotData.snapshot.displayName || 'export'}.png`}
                onRefresh={handleLastCreditRefresh}
                onRefreshFast={handleLastCreditRefreshFast}
                onLoad={() => setLastCreditIsLoading(false)}
              />
            </TabsContent>
            <TabsContent value="daily" className="pt-4">
              <div className="flex flex-col items-center space-y-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">
                    {t('dataContent.exportImageCard.dayLabel')}
                  </span>
                  <Select
                    value={selectedDay ?? ""}
                    onValueChange={handleDailyDayChange}
                    disabled={daysLoading || availableDays.length === 0}
                  >
                    <SelectTrigger variant="secondary" size="sm" className="min-w-[14rem]">
                      <SelectValue placeholder={
                        daysLoading
                          ? t('dataContent.exportImageCard.dayLoading')
                          : availableDays.length === 0
                            ? t('dataContent.exportImageCard.noPlays')
                            : t('dataContent.exportImageCard.dayPlaceholder')
                      } />
                    </SelectTrigger>
                    <SelectContent>
                      {availableDays.map(({ day, count }) => (
                        <SelectItem key={day} value={day}>
                          {formatDayLabel(day, count, locale)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {selectedDay ? (
                  <ImagePanel
                    imageUrl={dailyImageUrl}
                    imageKey={dailyImageKey}
                    isLoading={dailyIsLoading}
                    isDownloading={false}
                    fileName={`maimai-daily-${selectedDay}-${selectedSnapshotData.snapshot.displayName || 'export'}.png`}
                    onRefresh={handleDailyRefresh}
                    onRefreshFast={handleDailyRefreshFast}
                    onLoad={() => setDailyIsLoading(false)}
                  />
                ) : (
                  <div className="text-sm text-muted-foreground py-8">
                    {daysLoading
                      ? t('dataContent.exportImageCard.dayLoading')
                      : t('dataContent.exportImageCard.noPlays')}
                  </div>
                )}
              </div>
            </TabsContent>
          </TabsContents>
        </Tabs>
      ) : (
        profilePanel
      )}
    </div>
  );
}
