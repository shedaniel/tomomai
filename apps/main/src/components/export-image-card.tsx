"use client";

import { Button } from "@tomomai/ui";
import { CANVAS_HEIGHT, CANVAS_WIDTH } from "@/lib/image-spec";
import { Region, SnapshotWithSongs } from "@/lib/types";
import { Download, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Tabs, TabsList, TabsContents, TabsTrigger, TabsContent } from "@/components/animate-ui/components/radix/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@tomomai/ui/select-friendly";
import { trpc } from "@/lib/trpc-client";
import { CreditDrawerPicker, CreditSidebar } from "@/components/export-credit-picker";
import type { CreditSummary } from "@/server/services/credit-data";
import { useMediaQuery } from "@/hooks/use-media-query";

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

type ExportKind = "profile" | "credit" | "daily";

const EXPORT_PARAM = "export";
const CREDIT_PARAM = "credit";
const DAY_PARAM = "day";
const CREDIT_PAGE_SIZE = 20;

// Mirrors DataContent: replaceState keeps Next from re-fetching the RSC payload
function writeExportParams(kind: ExportKind, value?: { credit?: number | null; day?: string }) {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  params.delete(CREDIT_PARAM);
  params.delete(DAY_PARAM);
  if (kind === "profile") params.delete(EXPORT_PARAM);
  else params.set(EXPORT_PARAM, kind);
  if (kind === "credit" && value?.credit) params.set(CREDIT_PARAM, String(value.credit));
  if (kind === "daily" && value?.day) params.set(DAY_PARAM, value.day);
  const qs = params.toString();
  window.history.replaceState(null, "", qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
}

function readExportParams(searchParams: URLSearchParams | ReturnType<typeof useSearchParams>) {
  const kindParam = searchParams.get(EXPORT_PARAM);
  const kind: ExportKind = kindParam === "credit" || kindParam === "daily" ? kindParam : "profile";
  const creditParam = Number(searchParams.get(CREDIT_PARAM));
  const dayParam = searchParams.get(DAY_PARAM);
  return {
    kind,
    credit: kind === "credit" && Number.isInteger(creditParam) && creditParam > 0 ? creditParam : null,
    day: kind === "daily" && dayParam && /^\d{4}-\d{2}-\d{2}$/.test(dayParam) ? dayParam : undefined,
  };
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

function buildLastCreditUrl(region: Region, target: { at: number } | { beforeDate: Date }, publicSnapshotId: string | undefined, extra?: Record<string, string>) {
  const params = new URLSearchParams({ region });
  if ("at" in target) params.set('at', String(target.at));
  else params.set('beforeDate', target.beforeDate.toISOString());
  if (publicSnapshotId) params.set('snapshotId', publicSnapshotId);
  if (extra) {
    for (const [k, v] of Object.entries(extra)) params.set(k, v);
  }
  return `/api/last-credit?${params.toString()}`;
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
  const searchParams = useSearchParams();
  const [initialParams] = useState(() => readExportParams(searchParams));
  const isWide = useMediaQuery("(min-width: 1024px)", { initializeWithValue: false });

  const snapshotId = selectedSnapshotData.snapshot.id;
  const snapshotFetchedAt = selectedSnapshotData.snapshot.fetchedAt;
  const isPublic = !!publicSnapshotId;

  const [exportKind, setExportKind] = useState<ExportKind>(showLastCredit ? initialParams.kind : "profile");

  // Export image state
  const [exportImageUrl, setExportImageUrl] = useState<string>(
    buildExportImageUrl(snapshotId, region, username)
  );
  const [exportImageKey, setExportImageKey] = useState(0);
  const [exportIsLoading, setExportIsLoading] = useState(true);

  // Credit state. Credits are keyed by their first track's unix time so links stay stable.
  const [selectedCreditAt, setSelectedCreditAt] = useState<number | null>(initialParams.credit);
  const [creditImageKey, setCreditImageKey] = useState(0);
  const [creditIsLoading, setCreditIsLoading] = useState(true);
  const [creditUrlExtra, setCreditUrlExtra] = useState<Record<string, string>>({});

  // Credits up to the selected snapshot, matching the recent plays tab. The bound
  // is part of the input so each snapshot gets its own cached list.
  const creditsBefore = Math.floor(snapshotFetchedAt.getTime() / 1000) + 1;
  const getNextPageParam = (page: { nextCursor: number | null }) => page.nextCursor ?? undefined;
  const ownCreditsQuery = trpc.user.getCredits.useInfiniteQuery(
    { region, limit: CREDIT_PAGE_SIZE, before: creditsBefore },
    { getNextPageParam, enabled: showLastCredit && !isPublic },
  );
  const publicCreditsQuery = trpc.user.getPublicCredits.useInfiniteQuery(
    { region, limit: CREDIT_PAGE_SIZE, before: creditsBefore, snapshotId: publicSnapshotId! },
    { getNextPageParam, enabled: showLastCredit && isPublic },
  );
  const creditsQuery = isPublic ? publicCreditsQuery : ownCreditsQuery;
  const credits = useMemo(
    () => creditsQuery.data?.pages.flatMap((page) => page.credits) ?? [],
    [creditsQuery.data],
  );

  const linkedCreditLoaded = selectedCreditAt === null || credits.some((c) => c.at === selectedCreditAt);
  const ownCreditQuery = trpc.user.getCredit.useQuery(
    { region, at: selectedCreditAt ?? 0 },
    { enabled: showLastCredit && !isPublic && !linkedCreditLoaded },
  );
  const publicCreditQuery = trpc.user.getPublicCredit.useQuery(
    { region, at: selectedCreditAt ?? 0, snapshotId: publicSnapshotId! },
    { enabled: showLastCredit && isPublic && !linkedCreditLoaded },
  );
  const linkedCredit = isPublic ? publicCreditQuery.data : ownCreditQuery.data;

  const effectiveCreditAt = selectedCreditAt ?? credits[0]?.at ?? null;
  const selectedCredit: CreditSummary | null =
    credits.find((c) => c.at === effectiveCreditAt) ?? linkedCredit ?? null;

  const creditImageUrl = useMemo(
    () => buildLastCreditUrl(
      region,
      selectedCreditAt !== null ? { at: selectedCreditAt } : { beforeDate: snapshotFetchedAt },
      publicSnapshotId,
      creditUrlExtra,
    ),
    [region, selectedCreditAt, snapshotFetchedAt, publicSnapshotId, creditUrlExtra],
  );

  // Daily plays state
  const [selectedDay, setSelectedDay] = useState<string | undefined>(initialParams.day);
  const [dailyImageKey, setDailyImageKey] = useState(0);
  const [dailyIsLoading, setDailyIsLoading] = useState(true);
  const [dailyUrlExtra, setDailyUrlExtra] = useState<Record<string, string>>({});

  const ownDaysQuery = trpc.user.getDailyPlaysAvailableDays.useQuery(
    { region },
    { enabled: !isPublic },
  );
  const publicDaysQuery = trpc.user.getPublicDailyPlaysAvailableDays.useQuery(
    { snapshotId: publicSnapshotId!, region },
    { enabled: isPublic && showLastCredit },
  );
  const availableDays = (isPublic ? publicDaysQuery.data : ownDaysQuery.data) ?? [];
  const daysLoading = (isPublic ? publicDaysQuery.isFetching : ownDaysQuery.isFetching) && availableDays.length === 0;

  // Skips the first run so a day or credit from the URL survives mount
  const scopeKey = `${region}:${snapshotId}`;
  const lastScopeKey = useRef(scopeKey);
  useEffect(() => {
    if (lastScopeKey.current === scopeKey) return;
    lastScopeKey.current = scopeKey;
    setSelectedDay(undefined);
    setSelectedCreditAt(null);
    if (exportKind !== "profile") writeExportParams(exportKind);
  }, [scopeKey, exportKind]);

  useEffect(() => {
    if (!selectedDay && availableDays.length > 0) {
      setSelectedDay(availableDays[0].day);
    }
  }, [availableDays, selectedDay]);

  const dailyImageUrl = useMemo(
    () => buildDailyPlaysUrl(snapshotId, region, selectedDay, dailyUrlExtra),
    [snapshotId, region, selectedDay, dailyUrlExtra],
  );

  const handleExportKindChange = (value: string) => {
    const kind = value as ExportKind;
    setExportKind(kind);
    writeExportParams(kind, { credit: selectedCreditAt, day: selectedDay });
  };

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

  const handleCreditSelect = (credit: CreditSummary) => {
    if (credit.at === effectiveCreditAt) return;
    setSelectedCreditAt(credit.at);
    setCreditIsLoading(true);
    setCreditImageKey(prev => prev + 1);
    setCreditUrlExtra({});
    writeExportParams("credit", { credit: credit.at });
  };

  const handleCreditRefresh = () => {
    setCreditIsLoading(true);
    setCreditImageKey(prev => prev + 1);
    setCreditUrlExtra({ t: Date.now().toString() });
  };

  const handleCreditRefreshFast = () => {
    setCreditIsLoading(true);
    setCreditImageKey(prev => prev + 1);
    setCreditUrlExtra({ scale: '1', t: Date.now().toString() });
  };

  const handleDailyDayChange = (day: string) => {
    setSelectedDay(day);
    setDailyIsLoading(true);
    setDailyImageKey(prev => prev + 1);
    setDailyUrlExtra({});
    writeExportParams("daily", { day });
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

  const creditPickerProps = {
    credits,
    selected: selectedCredit,
    selectedAt: effectiveCreditAt,
    isLoading: creditsQuery.isLoading,
    hasMore: !!creditsQuery.hasNextPage,
    isFetchingMore: creditsQuery.isFetchingNextPage,
    onLoadMore: () => void creditsQuery.fetchNextPage(),
    onSelect: handleCreditSelect,
  };

  const creditDateSuffix = effectiveCreditAt
    ? `-${new Date(effectiveCreditAt * 1000).toISOString().slice(0, 16).replace(/[:T]/g, '')}`
    : '';

  const locale = typeof window !== 'undefined' ? navigator.language : 'en-US';

  return (
    <div className="w-full mx-auto space-y-6">
      <h2 className="text-lg font-semibold flex items-center gap-2">
        <Download className="h-5 w-5" />
        {t('dataContent.tabs.exportImage')}
      </h2>

      {showLastCredit ? (
        <Tabs value={exportKind} onValueChange={handleExportKindChange} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="profile">
              {t('dataContent.exportImageCard.profileImage')}
            </TabsTrigger>
            <TabsTrigger value="credit">
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
            <TabsContent value="credit" className="pt-4">
              <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[17rem_minmax(0,1fr)] lg:items-start lg:gap-6">
                {isWide ? (
                  <div className="lg:sticky lg:top-4">
                    <CreditSidebar {...creditPickerProps} />
                  </div>
                ) : (
                  <CreditDrawerPicker {...creditPickerProps} />
                )}
                <ImagePanel
                  imageUrl={creditImageUrl}
                  imageKey={creditImageKey}
                  isLoading={creditIsLoading}
                  isDownloading={false}
                  fileName={`maimai-credit${creditDateSuffix}-${selectedSnapshotData.snapshot.displayName || 'export'}.png`}
                  onRefresh={handleCreditRefresh}
                  onRefreshFast={handleCreditRefreshFast}
                  onLoad={() => setCreditIsLoading(false)}
                />
              </div>
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
