"use client";

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
import { Badge } from "@tomomai/ui";
import { Button } from "@tomomai/ui";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@tomomai/ui";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@tomomai/ui/select-friendly";
import { calculateProgress, parseStatusStates } from "@/lib/fetch-states";
import { getVersionInfo, VersionId } from "@tomomai/catalog/metadata";
import { trpc } from "@/lib/trpc-client";
import { FetchSession, Region, Snapshot } from "@/lib/types";
import { Calendar, Copy, Download, MoreHorizontal, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "motion/react";
import { getTransition } from "@/lib/animation-constants";

interface DataBannerProps {
  region: Region;
  snapshots: Snapshot[];
  selectedSnapshot: string | null;
  onSnapshotChange: (snapshotId: string) => void;
  onDeleteSnapshot: (snapshotId: string) => void;
  onFetchData: () => void;
  isFetching: boolean;
  currentSession: FetchSession | null;
  // Copy functionality
  onCopySnapshot: (snapshotId: string, targetVersion: VersionId) => Promise<any>;
  isCopying: boolean;
}

// Helper function to format dates
function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

// Snapshot selector component
function SnapshotSelector({
  snapshots,
  selectedSnapshot,
  onSnapshotChange,
  t
}: {
  snapshots: Snapshot[];
  selectedSnapshot: string | null;
  onSnapshotChange: (snapshotId: string) => void;
  t: any;
}) {
  const selectedSnapshotData = snapshots.find(snapshot => snapshot.id === selectedSnapshot);

  return (
    <Select value={selectedSnapshot || undefined} onValueChange={onSnapshotChange}>
      <SelectTrigger className="flex-1 min-w-0 h-10">
        <SelectValue placeholder={t('dataBanner.selectSnapshot')} className="overflow-hidden">
          {selectedSnapshotData ? (
            <div className="flex flex-col items-start min-w-0 gap-0.5">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="truncate text-xs font-medium">{selectedSnapshotData.displayName}</span>
                <Badge variant="tonal" className="shrink-0 px-1.5 py-0 text-2xs font-medium bg-primary-container/50">{selectedSnapshotData.rating} rating</Badge>
                <Badge variant="secondary" className="shrink-0 px-1.5 py-0 text-2xs font-normal bg-secondary/50">{getVersionInfo(selectedSnapshotData.gameVersion)?.shortName || "Unknown"}</Badge>
              </div>
              <span className="text-2xs text-muted-foreground">{formatDate(selectedSnapshotData.fetchedAt)}</span>
            </div>
          ) : (
            <span>{t('dataBanner.selectSnapshot')}</span>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {snapshots.map((snapshot) => (
          <SelectItem key={snapshot.id} value={snapshot.id}>
            <div className="flex flex-col items-start min-w-0 gap-0.5">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="truncate text-xs font-medium">{snapshot.displayName}</span>
                <Badge variant="tonal" className="shrink-0 px-1.5 py-0 text-2xs font-medium bg-primary-container/50">{snapshot.rating} rating</Badge>
                <Badge variant="secondary" className="shrink-0 px-1.5 py-0 text-2xs font-normal bg-secondary/50">{getVersionInfo(snapshot.gameVersion)?.shortName || "Unknown"}</Badge>
              </div>
              <span className="text-2xs text-muted-foreground">{formatDate(snapshot.fetchedAt)}</span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// Delete snapshot button component
function DeleteSnapshotButton({
  selectedSnapshot,
  onDeleteSnapshot
}: {
  selectedSnapshot: string;
  onDeleteSnapshot: (snapshotId: string) => void;
}) {
  return (
    <ResponsiveDialog>
      <ResponsiveDialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-10 w-10 p-0"
          title="Delete selected snapshot"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </ResponsiveDialogTrigger>
      <ResponsiveDialogContent showCloseButton={false}>
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>Delete Snapshot</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            Are you sure you want to delete this snapshot? This action cannot be undone and will permanently remove all your scores from this snapshot.
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        <ResponsiveDialogFooter>
          <ResponsiveDialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </ResponsiveDialogClose>
          <ResponsiveDialogClose asChild>
            <Button
              variant="destructive"
              onClick={() => onDeleteSnapshot(selectedSnapshot)}
            >
              Delete
            </Button>
          </ResponsiveDialogClose>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

// Copy snapshot button component with lazy-loaded versions
function CopySnapshotButton({
  isDropdownOpen,
  setIsDropdownOpen,
  isCopying,
  region,
  currentGameVersion,
  onCopyToVersion
}: {
  isDropdownOpen: boolean;
  setIsDropdownOpen: (open: boolean) => void;
  isCopying: boolean;
  region: Region;
  currentGameVersion: number | undefined;
  onCopyToVersion: (targetVersion: VersionId) => void;
}) {
  // Only load versions when dropdown is opened
  const {
    data: availableVersionsData,
    isLoading: isLoadingVersions,
  } = trpc.user.getAvailableVersionsForCopy.useQuery(
    {
      region,
      currentVersion: currentGameVersion!,
    },
    {
      enabled: isDropdownOpen && !!currentGameVersion,
      refetchOnWindowFocus: false,
      staleTime: 30 * 60 * 1000, // 30 minutes - versions don't change often
    }
  );

  const availableVersions = availableVersionsData?.availableVersions || [];

  return (
    <DropdownMenu modal={false} open={isDropdownOpen} onOpenChange={setIsDropdownOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-10 w-10 p-0"
          title="More options"
          disabled={isCopying}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuSub>
          <DropdownMenuSubTrigger disabled={isLoadingVersions || availableVersions.length === 0} className="gap-3">
            <Copy className="h-4 w-4" />
            <span>Copy as another game version</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {isLoadingVersions ? (
              <DropdownMenuItem disabled>
                Loading versions...
              </DropdownMenuItem>
            ) : availableVersions.length === 0 ? (
              <DropdownMenuItem disabled>
                No other versions available
              </DropdownMenuItem>
            ) : (
              availableVersions.map((version) => (
                <DropdownMenuItem
                  key={version.id}
                  onClick={() => onCopyToVersion(version.id)}
                  disabled={isCopying}
                >
                  <span>{version.shortName}</span>
                  <span className="text-xs text-muted-foreground ml-2">
                    {version.name}
                  </span>
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Fetch data button component
function FetchDataButton({
  onFetchData,
  isFetching,
  currentSession,
  t
}: {
  onFetchData: () => void;
  isFetching: boolean;
  currentSession: FetchSession | null;
  t: any;
}) {
  // Calculate progress based on statusStates
  const progress = currentSession?.statusStates
    ? calculateProgress(parseStatusStates(currentSession.statusStates))
    : 0;

  return (
    <Button
      onClick={onFetchData}
      disabled={isFetching}
      className="relative flex h-10 items-center space-x-2 overflow-hidden disabled:opacity-100 disabled:bg-primary/50"
    >
      {/* Progress background */}
      {isFetching && (
        <div
          className="absolute inset-0 bg-primary transition-all duration-300 ease-out z-5"
          style={{ width: `${progress}%` }}
        />
      )}

      {/* Button content */}
      <div className="relative z-10 flex items-center space-x-2">
        {isFetching ? (
          <>
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" />
            <span>{t('dataBanner.fetchingData')}</span>
          </>
        ) : (
          <>
            <Download className="h-4 w-4" />
            <span>{t('dataBanner.fetchNewData')}</span>
          </>
        )}
      </div>
    </Button>
  );
}

// No data instructions component
function NoDataInstructions({
  hasSnapshots,
  region,
  t
}: {
  hasSnapshots: boolean;
  region: Region;
  t: any;
}) {
  if (hasSnapshots) return null;

  return (
    <motion.div
      className="mt-4 p-3 bg-muted/50 rounded-md"
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={getTransition({ duration: 0.3 })}
    >
      <p className="text-sm text-muted-foreground">
        {t('dataBanner.noDataInstructions')}
      </p>
    </motion.div>
  );
}

export function DataBanner({
  region,
  snapshots,
  selectedSnapshot,
  onSnapshotChange,
  onDeleteSnapshot,
  onFetchData,
  isFetching,
  currentSession,
  onCopySnapshot,
  isCopying,
}: DataBannerProps) {
  const t = useTranslations();
  const hasSnapshots = snapshots.length > 0;
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // Get current game version from selected snapshot
  const selectedSnapshotObj = snapshots.find(s => s.id === selectedSnapshot);
  const currentGameVersion = selectedSnapshotObj?.gameVersion;

  const handleCopyToVersion = async (targetVersion: VersionId) => {
    if (!selectedSnapshot) return;

    try {
      const result = await onCopySnapshot(selectedSnapshot, targetVersion);
      const versionInfo = getVersionInfo(targetVersion);

      // Show rating change if available
      const ratingChangeText = result.originalRating !== undefined && result.newRating !== undefined
        ? ` Rating: ${result.originalRating} → ${result.newRating}`
        : '';

      toast.success(
        `Snapshot copied to ${versionInfo?.shortName || 'Unknown version'}! ${result.copiedScores}/${result.totalOriginalScores} scores copied.${ratingChangeText}`
      );
      setIsDropdownOpen(false);
    } catch (error) {
      toast.error("Failed to copy snapshot. Please try again.");
      console.error("Copy snapshot error:", error);
    }
  };

  return (
    <div className="border-b pb-6">
      <div>
        <div className="flex flex-col space-y-4 md:flex-row md:items-center md:justify-between md:space-y-0 md:space-x-4">
          {/* Left side - Snapshot selector */}
          <div className="flex items-center gap-x-4">
            <div className="flex items-center gap-x-2">
              <Calendar className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="text-sm font-medium whitespace-nowrap">{t('dataBanner.dataSnapshot')}</span>
            </div>

            {hasSnapshots ? (
              <SnapshotSelector
                snapshots={snapshots}
                selectedSnapshot={selectedSnapshot}
                onSnapshotChange={onSnapshotChange}
                t={t}
              />
            ) : (
              <AnimatePresence>
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={getTransition({ duration: 0.3 })}
                >
                  <Badge variant="secondary">{t('dataBanner.noDataAvailable')}</Badge>
                </motion.div>
              </AnimatePresence>
            )}
          </div>

          {/* Right side - Fetch controls */}
          <div className="flex items-center space-x-3 justify-between">
            {hasSnapshots && !!selectedSnapshot && (
              <div className="flex items-center space-x-2">
                <DeleteSnapshotButton
                  selectedSnapshot={selectedSnapshot}
                  onDeleteSnapshot={onDeleteSnapshot}
                />

                <CopySnapshotButton
                  isDropdownOpen={isDropdownOpen}
                  setIsDropdownOpen={setIsDropdownOpen}
                  isCopying={isCopying}
                  region={region}
                  currentGameVersion={currentGameVersion}
                  onCopyToVersion={handleCopyToVersion}
                />
              </div>
            )}
            <FetchDataButton
              onFetchData={onFetchData}
              isFetching={isFetching}
              currentSession={currentSession}
              t={t}
            />
          </div>
        </div>

        {/* Fetch instructions */}
        <NoDataInstructions
          hasSnapshots={hasSnapshots}
          region={region}
          t={t}
        />
      </div>
    </div>
  );
}
