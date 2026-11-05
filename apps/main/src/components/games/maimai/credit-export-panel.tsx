"use client";

import { useMemo, useState } from "react";
import { useMediaQuery } from "@/hooks/use-media-query";
import type { Region } from "@/lib/games/ids";
import { trpc } from "@/lib/trpc-client";
import type { CreditSummary } from "@/lib/trpc-types";
import { ImagePanel } from "@/components/player/export-image-panel";
import { CreditDrawerPicker, CreditSidebar } from "./export-credit-picker";

const CREDIT_PAGE_SIZE = 20;

interface CreditExportPanelProps {
  region: Region;
  /** Whose credits the image route shows: the visitor's published snapshot or the owner's region. */
  playsOwner: Record<string, string>;
  publicSnapshotId?: string;
  snapshotFetchedAt: Date;
  displayName: string;
  /** The picked credit, keyed by its first track's unix time. Null shows the latest credit up to the snapshot. */
  selectedAt: number | null;
  onSelect: (at: number) => void;
}

function buildLastCreditUrl(owner: Record<string, string>, target: { at: number } | { beforeDate: Date }, extra: Record<string, string>) {
  const params = new URLSearchParams(owner);
  if ("at" in target) params.set("at", String(target.at));
  else params.set("beforeDate", target.beforeDate.toISOString());
  for (const [k, v] of Object.entries(extra)) params.set(k, v);
  return `/api/last-credit?${params.toString()}`;
}

export function CreditExportPanel({ region, playsOwner, publicSnapshotId, snapshotFetchedAt, displayName, selectedAt, onSelect }: CreditExportPanelProps) {
  const isPublic = !!publicSnapshotId;
  const isWide = useMediaQuery("(min-width: 1024px)", { initializeWithValue: false });
  const [imageKey, setImageKey] = useState(0);
  const [urlExtra, setUrlExtra] = useState<Record<string, string>>({});
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);

  // Credits up to the selected snapshot, matching the recent plays tab. The bound
  // is part of the input so each snapshot gets its own cached list.
  const before = Math.floor(snapshotFetchedAt.getTime() / 1000) + 1;
  const getNextPageParam = (page: { nextCursor: number | null }) => page.nextCursor ?? undefined;
  const ownCreditsQuery = trpc.maimai.getCredits.useInfiniteQuery(
    { region, limit: CREDIT_PAGE_SIZE, before },
    { getNextPageParam, enabled: !isPublic },
  );
  const publicCreditsQuery = trpc.maimai.getPublicCredits.useInfiniteQuery(
    { snapshotId: publicSnapshotId!, limit: CREDIT_PAGE_SIZE, before },
    { getNextPageParam, enabled: isPublic },
  );
  const creditsQuery = isPublic ? publicCreditsQuery : ownCreditsQuery;
  const credits = useMemo(
    () => creditsQuery.data?.pages.flatMap((page) => page.credits) ?? [],
    [creditsQuery.data],
  );

  // A credit linked from recent plays may be older than the loaded pages
  const linkedCreditLoaded = selectedAt === null || credits.some((c) => c.at === selectedAt);
  const ownCreditQuery = trpc.maimai.getCredit.useQuery(
    { region, at: selectedAt ?? 0 },
    { enabled: !isPublic && !linkedCreditLoaded },
  );
  const publicCreditQuery = trpc.maimai.getPublicCredit.useQuery(
    { snapshotId: publicSnapshotId!, at: selectedAt ?? 0 },
    { enabled: isPublic && !linkedCreditLoaded },
  );
  const linkedCredit = isPublic ? publicCreditQuery.data : ownCreditQuery.data;

  const effectiveAt = selectedAt ?? credits[0]?.at ?? null;
  const selectedCredit: CreditSummary | null = credits.find((c) => c.at === effectiveAt) ?? linkedCredit ?? null;

  const imageUrl = useMemo(
    () => buildLastCreditUrl(playsOwner, selectedAt !== null ? { at: selectedAt } : { beforeDate: snapshotFetchedAt }, urlExtra),
    [playsOwner, selectedAt, snapshotFetchedAt, urlExtra],
  );

  const handleSelect = (credit: CreditSummary) => {
    if (credit.at === effectiveAt) return;
    setUrlExtra({});
    onSelect(credit.at);
  };

  const refresh = (extra: Record<string, string>) => {
    setImageKey(prev => prev + 1);
    setUrlExtra({ ...extra, t: Date.now().toString() });
  };

  const pickerProps = {
    credits,
    selected: selectedCredit,
    selectedAt: effectiveAt,
    isLoading: creditsQuery.isLoading,
    hasMore: !!creditsQuery.hasNextPage,
    isFetchingMore: creditsQuery.isFetchingNextPage,
    onLoadMore: () => void creditsQuery.fetchNextPage(),
    onSelect: handleSelect,
  };

  const dateSuffix = effectiveAt
    ? `-${new Date(effectiveAt * 1000).toISOString().slice(0, 16).replace(/[:T]/g, "")}`
    : "";

  return (
    <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[17rem_minmax(0,1fr)] lg:items-start lg:gap-6">
      {isWide ? (
        <div className="lg:sticky lg:top-4">
          <CreditSidebar {...pickerProps} />
        </div>
      ) : (
        <CreditDrawerPicker {...pickerProps} />
      )}
      <ImagePanel
        imageUrl={imageUrl}
        imageKey={imageKey}
        isLoading={loadedUrl !== imageUrl}
        fileName={`maimai-credit${dateSuffix}-${displayName || "export"}.png`}
        onRefresh={() => refresh({})}
        onRefreshFast={() => refresh({ scale: "1" })}
        onLoad={() => setLoadedUrl(imageUrl)}
      />
    </div>
  );
}
