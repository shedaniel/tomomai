"use client";

import { useGame } from "@/components/providers/game-provider";
import { supportsGameFeature } from "@/lib/games/frontend";
import type { Region } from "@/lib/games/ids";
import type { GameSnapshot } from "@/lib/games/player-view";
import { Download } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Tabs, TabsList, TabsContents, TabsTrigger, TabsContent } from "@/components/animate-ui/components/radix/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@tomomai/ui/select-friendly";
import { trpc } from "@/lib/trpc-client";
import { CreditExportPanel } from "@/components/games/maimai/credit-export-panel";
import { ImagePanel } from "./export-image-panel";

interface ExportImageCardProps {
  snapshot: Pick<GameSnapshot, "publicId" | "fetchedAt" | "displayName">;
  region: Region;
  /** Offers the play images the game has. Off for a visitor the owner does not share recent plays with. */
  showPlays?: boolean;
  username?: string;
  /** Public snapshot publicId. When set, daily-plays days fetch uses the public tRPC procedure. */
  publicSnapshotId?: string;
}

type ExportKind = "profile" | "credit" | "daily";

const EXPORT_PARAM = "export";
const CREDIT_PARAM = "credit";
const DAY_PARAM = "day";

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

function readExportParams(searchParams: ReturnType<typeof useSearchParams>) {
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

const TAB_COLUMNS = { 2: "grid-cols-2", 3: "grid-cols-3" } as const;

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

/** A visitor's play images name the published snapshot, the owner's name the region. */
function playsOwnerParams(region: Region, publicSnapshotId: string | undefined): Record<string, string> {
  return publicSnapshotId ? { snapshotId: publicSnapshotId } : { region };
}

function buildDailyPlaysUrl(owner: Record<string, string>, day: string | undefined, extra?: Record<string, string>) {
  const params = new URLSearchParams(owner);
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

export function ExportImageCard({ snapshot, region, showPlays = true, username, publicSnapshotId }: ExportImageCardProps) {
  const t = useTranslations();
  const game = useGame();
  const showLastCredit = showPlays && supportsGameFeature(game, "last-credit", region);
  const showDaily = showPlays && supportsGameFeature(game, "daily-plays", region);
  const searchParams = useSearchParams();
  const [initialParams] = useState(() => readExportParams(searchParams));

  const snapshotId = snapshot.publicId;
  const isPublic = !!publicSnapshotId;
  const playsOwner = useMemo(() => playsOwnerParams(region, publicSnapshotId), [region, publicSnapshotId]);

  const [exportKind, setExportKind] = useState<ExportKind>(initialParams.kind);

  // Export image state
  const [exportImageUrl, setExportImageUrl] = useState<string>(
    buildExportImageUrl(snapshotId, region, username)
  );
  const [exportImageKey, setExportImageKey] = useState(0);
  const [exportIsLoading, setExportIsLoading] = useState(true);

  // Credits are keyed by their first track's unix time so links stay stable.
  const [selectedCreditAt, setSelectedCreditAt] = useState<number | null>(initialParams.credit);

  // Daily plays state
  const [selectedDay, setSelectedDay] = useState<string | undefined>(initialParams.day);
  const [dailyImageKey, setDailyImageKey] = useState(0);
  const [dailyIsLoading, setDailyIsLoading] = useState(true);
  const [dailyUrlExtra, setDailyUrlExtra] = useState<Record<string, string>>({});

  const ownDaysQuery = trpc.user.getDailyPlaysAvailableDays.useQuery(
    { game: game.id, region },
    { enabled: showDaily && !isPublic },
  );
  const publicDaysQuery = trpc.user.getPublicDailyPlaysAvailableDays.useQuery(
    { game: game.id, snapshotId: publicSnapshotId! },
    { enabled: showDaily && isPublic },
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
    () => buildDailyPlaysUrl(playsOwner, selectedDay, dailyUrlExtra),
    [playsOwner, selectedDay, dailyUrlExtra],
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

  const handleCreditSelect = (at: number) => {
    setSelectedCreditAt(at);
    writeExportParams("credit", { credit: at });
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
      fileName={`${game.id}-profile-${snapshot.displayName || 'export'}.png`}
      onRefresh={handleExportRefresh}
      onRefreshFast={handleExportRefreshFast}
      onRefreshProfile={handleExportRefreshProfile}
      onLoad={() => setExportIsLoading(false)}
    />
  );

  const locale = typeof window !== 'undefined' ? navigator.language : 'en-US';

  const creditPanel = (
    <CreditExportPanel
      region={region}
      playsOwner={playsOwner}
      publicSnapshotId={publicSnapshotId}
      snapshotFetchedAt={snapshot.fetchedAt}
      displayName={snapshot.displayName}
      selectedAt={selectedCreditAt}
      onSelect={handleCreditSelect}
    />
  );

  const dailyPanel = (
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
          fileName={`${game.id}-daily-${selectedDay}-${snapshot.displayName || 'export'}.png`}
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
  );

  const tabs: { value: ExportKind; label: string; panel: React.ReactNode }[] = [
    { value: "profile", label: t('dataContent.exportImageCard.profileImage'), panel: profilePanel },
    ...(showLastCredit ? [{ value: "credit" as const, label: t('dataContent.exportImageCard.lastCredit'), panel: creditPanel }] : []),
    ...(showDaily ? [{ value: "daily" as const, label: t('dataContent.exportImageCard.dailyPlays'), panel: dailyPanel }] : []),
  ];
  const activeKind = tabs.some(tab => tab.value === exportKind) ? exportKind : "profile";

  return (
    <div className="w-full mx-auto space-y-6">
      <h2 className="text-lg font-semibold flex items-center gap-2">
        <Download className="h-5 w-5" />
        {t('dataContent.tabs.exportImage')}
      </h2>

      {tabs.length > 1 ? (
        <Tabs value={activeKind} onValueChange={handleExportKindChange} className="w-full">
          <TabsList className={`grid w-full ${TAB_COLUMNS[tabs.length as keyof typeof TAB_COLUMNS]}`}>
            {tabs.map(tab => (
              <TabsTrigger key={tab.value} value={tab.value}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContents>
            {tabs.map(tab => (
              <TabsContent key={tab.value} value={tab.value} className="pt-4">
                {tab.panel}
              </TabsContent>
            ))}
          </TabsContents>
        </Tabs>
      ) : (
        profilePanel
      )}
    </div>
  );
}
