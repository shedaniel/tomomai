"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@tomomai/ui/select-friendly";
import { Progress, TooltipFriendly, TooltipFriendlyContent, TooltipFriendlyTrigger, useTooltipFriendly } from "@tomomai/ui";
import { Button } from "@tomomai/ui";
import { DIFFICULTY_COLORS } from "@/lib/difficulty";
import { DIFFICULTY_ENUM } from "@/lib/db/types";
import { getVersionInfo, VERSIONS } from "@/lib/metadata";
import { Region, SnapshotWithSongs } from "@/lib/types";
import { trpc } from "@/lib/trpc-client";
import { ArrowLeft, Award, ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { StatsCardSkeleton } from "./stats-card.skeleton";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { STAGGER } from "@/lib/animation-constants";
import { useMediaQuery } from "@/hooks/use-media-query";
import { SongGridCard } from "@/components/songs-card";
import { AutoHeight } from "./animate-ui/primitives/effects/auto-height";
import { cn } from "@/lib/utils";

interface StatsCardProps {
  region: Region;
  selectedSnapshotData: SnapshotWithSongs | null;
  snapshotId?: string;
}

type Tier = { key: string; label: string; color: string; includes: string[] };

// Cumulative steps from best to worst; A also counts AA and AAA, lower grades are left out
const GRADE_TIERS: Tier[] = [
  { key: "SSS+", label: "SSS+", color: "bg-amber-300", includes: ["SSS+"] },
  { key: "SSS", label: "SSS", color: "bg-amber-500", includes: ["SSS"] },
  { key: "SS+", label: "SS+", color: "bg-orange-400", includes: ["SS+"] },
  { key: "SS", label: "SS", color: "bg-orange-600", includes: ["SS"] },
  { key: "S+", label: "S+", color: "bg-rose-400", includes: ["S+"] },
  { key: "S", label: "S", color: "bg-rose-600", includes: ["S"] },
  { key: "A", label: "A", color: "bg-sky-500", includes: ["AAA", "AA", "A"] },
];

const FC_TIERS: Tier[] = [
  { key: "ap+", label: "AP+", color: "bg-amber-300", includes: ["ap+"] },
  { key: "ap", label: "AP", color: "bg-amber-500", includes: ["ap"] },
  { key: "fc+", label: "FC+", color: "bg-emerald-400", includes: ["fc+"] },
  { key: "fc", label: "FC", color: "bg-emerald-600", includes: ["fc"] },
];

const FS_TIERS: Tier[] = [
  { key: "fdx+", label: "FDX+", color: "bg-violet-300", includes: ["fdx+"] },
  { key: "fdx", label: "FDX", color: "bg-violet-500", includes: ["fdx"] },
  { key: "fs+", label: "FS+", color: "bg-sky-300", includes: ["fs+"] },
  { key: "fs", label: "FS", color: "bg-sky-500", includes: ["fs"] },
  { key: "sync", label: "SYNC", color: "bg-cyan-700", includes: ["sync"] },
];

const MAX_LEVEL_ROWS = 8;

type Counts = { grades: Record<string, number>; fc: Record<string, number>; fs: Record<string, number>; charts: number };
type LevelRow = Counts & { key: string; label: string };

function emptyCounts(): Counts {
  return { grades: {}, fc: {}, fs: {}, charts: 0 };
}

function mergeCounts(target: Counts, source: Partial<Counts> & { charts?: number }) {
  for (const field of ["grades", "fc", "fs"] as const) {
    for (const [key, count] of Object.entries(source[field] ?? {})) {
      target[field][key] = (target[field][key] ?? 0) + count;
    }
  }
  target.charts += source.charts ?? 0;
}

function levelValue(level: string) {
  return parseFloat(level) + (level.endsWith("+") ? 0.5 : 0);
}

function tierSegments(row: Counts, tiers: Tier[], field: "grades" | "fc" | "fs") {
  const counts = tiers.map(tier => tier.includes.reduce((sum, key) => sum + (row[field][key] ?? 0), 0));
  return tiers.map((tier, index) => ({
    tier,
    count: counts[index],
    cumulative: counts.slice(0, index + 1).reduce((sum, count) => sum + count, 0),
  }));
}

function TierBreakdown({ row, segments }: { row: LevelRow; segments: ReturnType<typeof tierSegments> }) {
  const { isTouch } = useTooltipFriendly();
  const percent = (count: number) => row.charts > 0 ? (count / row.charts) * 100 : 0;
  return (
    <div className={cn("grid grid-cols-[auto_1fr_auto] items-center tabular-nums", isTouch ? "gap-x-4 gap-y-2.5 text-sm" : "gap-x-3 gap-y-1 text-xs")}>
      {segments.map(segment => (
        <OrBetterRow key={segment.tier.key} segment={segment} percent={percent(segment.cumulative)} isTouch={isTouch} />
      ))}
    </div>
  );
}

function OrBetterRow({ segment, percent, isTouch }: { segment: ReturnType<typeof tierSegments>[number]; percent: number; isTouch: boolean }) {
  const t = useTranslations("playerStats");
  return (
    <>
      <span className="inline-flex items-center gap-1.5 font-medium">
        <span className={cn("rounded-sm", isTouch ? "h-2.5 w-2.5" : "h-2 w-2", segment.tier.color)} />
        {t("orBetter", { tier: segment.tier.label })}
      </span>
      <span className="text-right text-muted-foreground">{segment.cumulative.toLocaleString()}</span>
      <span className="text-right w-14">{percent.toFixed(1)}%</span>
    </>
  );
}

function StatsBar({ row, tiers, field, className }: { row: LevelRow; tiers: Tier[]; field: "grades" | "fc" | "fs"; className?: string }) {
  const t = useTranslations("playerStats");
  const segments = tierSegments(row, tiers, field);
  const percent = (count: number) => row.charts > 0 ? (count / row.charts) * 100 : 0;
  const describe = (segment: typeof segments[number]) => t("tierTooltip", {
    tier: segment.tier.label,
    count: segment.cumulative.toLocaleString(),
    total: row.charts.toLocaleString(),
    percent: percent(segment.cumulative).toFixed(1),
  });
  return (
    <TooltipFriendly delayDuration={0}>
      <TooltipFriendlyTrigger asChild>
        {/* Padding widens the hover target beyond the thin bar */}
        <div className="-my-1.5 py-1.5 cursor-default" role="img" aria-label={`${row.label}: ${segments.map(describe).join(", ")}`}>
          <div className={cn("flex h-3 w-full overflow-hidden rounded-full bg-muted outline outline-1 -outline-offset-1 outline-black/10 dark:outline-transparent", className)}>
            {segments.map(segment => segment.count > 0 && (
              <div
                key={segment.tier.key}
                className={cn("h-full transition-[width] duration-500 ease-out", segment.tier.color)}
                style={{ width: `${percent(segment.count)}%` }}
              />
            ))}
          </div>
        </div>
      </TooltipFriendlyTrigger>
      <TooltipFriendlyContent
        side="top"
        className="min-w-52"
        title={
          <span className="flex items-baseline justify-between gap-4">
            <span>{row.label}</span>
            <span className="font-normal text-muted-foreground">{t("chartCount", { count: row.charts })}</span>
          </span>
        }
        description={t("breakdownDescription")}
      >
        <TierBreakdown row={row} segments={segments} />
      </TooltipFriendlyContent>
    </TooltipFriendly>
  );
}

type LevelBreakdown = { all: LevelRow; top: LevelRow[]; group: LevelRow | null; rest: LevelRow[] };

const ROW_GRID = "grid grid-cols-[4rem_1fr_2.75rem] sm:grid-cols-[5.5rem_1fr_4.5rem] items-center gap-2 sm:gap-3";

function StatsRowContent({ row, tiers, field, emphasized = false, nested = false, label }: {
  row: LevelRow;
  tiers: Tier[];
  field: "grades" | "fc" | "fs";
  emphasized?: boolean;
  nested?: boolean;
  label?: React.ReactNode;
}) {
  return (
    <>
      <span className={cn(
        "text-sm truncate text-left",
        emphasized ? "font-semibold" : "font-medium",
        nested && "pl-3.5 text-muted-foreground",
      )}>{label ?? row.label}</span>
      <StatsBar row={row} tiers={tiers} field={field} className={emphasized ? "h-4" : undefined} />
      <span className="text-xs text-muted-foreground text-right tabular-nums">{row.charts.toLocaleString()}</span>
    </>
  );
}

function StatsSection({ title, breakdown, tiers, field }: {
  title: string;
  breakdown: LevelBreakdown;
  tiers: Tier[];
  field: "grades" | "fc" | "fs";
}) {
  const t = useTranslations("playerStats");
  const [expanded, setExpanded] = useState(false);
  const { all, top, group, rest } = breakdown;
  const rowMotion = (index: number) => ({
    initial: { opacity: 0, x: -10 },
    animate: { opacity: 1, x: 0 },
    transition: { duration: 0.2, delay: STAGGER.calculateDelay(index, 0.03) },
  });
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{title}</h3>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
          {tierSegments(all, tiers, field).map(({ tier, cumulative }) => (
            <span key={tier.key} className="inline-flex items-center gap-1.5">
              <span className={cn("h-2.5 w-2.5 rounded-sm", tier.color)} />
              <span className="font-medium">{tier.label}</span>
              <span className="text-muted-foreground tabular-nums">
                {all.charts > 0 ? ((cumulative / all.charts) * 100).toFixed(0) : 0}%
              </span>
            </span>
          ))}
        </div>
      </div>
      <div className="space-y-2.5">
        <motion.div {...rowMotion(0)} className={cn(ROW_GRID, "pb-2.5 border-b border-dashed")}>
          <StatsRowContent row={all} tiers={tiers} field={field} emphasized />
        </motion.div>
        {top.map((row, index) => (
          <motion.div key={row.key} {...rowMotion(index + 1)} className={ROW_GRID}>
            <StatsRowContent row={row} tiers={tiers} field={field} />
          </motion.div>
        ))}
        {group && (
          <motion.div {...rowMotion(top.length + 1)}>
            <button
              type="button"
              onClick={() => setExpanded(value => !value)}
              aria-expanded={expanded}
              aria-label={t(expanded ? "collapseLevels" : "expandLevels", { level: rest[0]?.key ?? "" })}
              className={cn(ROW_GRID, "w-[calc(100%+1rem)] -mx-2 px-2 py-1 rounded-md transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring")}
            >
              <StatsRowContent
                row={group}
                tiers={tiers}
                field={field}
                label={
                  <span className="inline-flex items-center gap-1">
                    {group.label}
                    <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-300 ease-out", expanded && "rotate-180")} />
                  </span>
                }
              />
            </button>
            <AnimatePresence initial={false}>
              {expanded && (
                <motion.div
                  key="rest"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
                  className="overflow-hidden"
                >
                  <div className="relative space-y-2.5 pt-2.5 before:absolute before:left-1 before:top-2.5 before:bottom-1 before:w-px before:bg-border">
                    {rest.map((row, index) => (
                      <motion.div
                        key={row.key}
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2, delay: 0.05 + index * 0.025 }}
                        className={ROW_GRID}
                      >
                        <StatsRowContent row={row} tiers={tiers} field={field} nested />
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </div>
    </div>
  );
}

// Plate types
type PlateType = "kiwami" | "shou" | "shin" | "maimai";
const PLATE_LABELS: Record<PlateType, string> = {
  kiwami: "極",
  shou: "将",
  shin: "神",
  maimai: "舞舞",
};

// Plates Grid Component
interface PlatesGridProps {
  data: any;
  selectedVersion: string;
  region: Region;
  snapshotId?: string;
}

function PlatesGrid({ data, selectedVersion, region, snapshotId }: PlatesGridProps) {
  const t = useTranslations();
  const isDesktop = useMediaQuery("(min-width: 768px)", { initializeWithValue: false });
  const [expandedCell, setExpandedCell] = useState<{ plateType: PlateType; difficulty: string } | null>(null);

  const isExpanded = expandedCell !== null && selectedVersion !== "all";

  // Fetch songs for expanded cell
  const { data: ownPlateSongs, isLoading: ownSongsLoading } = trpc.user.getPlateSongs.useQuery(
    {
      region,
      version: selectedVersion,
      difficulty: expandedCell?.difficulty as any,
      plateType: expandedCell?.plateType as any,
    },
    {
      enabled: isExpanded && !snapshotId,
    }
  );
  const { data: publicPlateSongs, isLoading: publicSongsLoading } = trpc.user.getPublicPlateSongs.useQuery(
    {
      snapshotId: snapshotId!,
      region,
      version: selectedVersion,
      difficulty: expandedCell?.difficulty as any,
      plateType: expandedCell?.plateType as any,
    },
    {
      enabled: isExpanded && !!snapshotId,
    }
  );
  const plateSongs = snapshotId ? publicPlateSongs : ownPlateSongs;
  const isSongsLoading = snapshotId ? publicSongsLoading : ownSongsLoading;

  // Calculate plate progress for a specific version
  const plateProgress = useMemo(() => {
    if (!data || selectedVersion === "all") return null;

    const versionData = data.stats[selectedVersion];
    if (!versionData) return null;

    // Difficulties to check (Basic to Master)
    const mainDifficulties = ["basic", "advanced", "expert", "master"];
    const totalSongs: Record<string, number> = {};
    const progress: Record<PlateType, Record<string, number>> = {
      kiwami: {},
      shou: {},
      shin: {},
      maimai: {},
    };

    // Initialize counts
    for (const difficulty of mainDifficulties) {
      totalSongs[difficulty] = data.totalSongs[selectedVersion]?.[difficulty] || 0;
      progress.kiwami[difficulty] = 0;
      progress.shou[difficulty] = 0;
      progress.shin[difficulty] = 0;
      progress.maimai[difficulty] = 0;
    }

    // Calculate progress for each plate type
    for (const difficulty of mainDifficulties) {
      const diffData = versionData[difficulty];
      if (!diffData) continue;

      // 極 (kiwami): FC or above
      const fcCount = (diffData.fc["fc"] || 0) + (diffData.fc["fc+"] || 0) +
        (diffData.fc["ap"] || 0) + (diffData.fc["ap+"] || 0);
      progress.kiwami[difficulty] = fcCount;

      // 将 (Shou): SSS or above
      const sssCount = (diffData.grades["SSS"] || 0) + (diffData.grades["SSS+"] || 0);
      progress.shou[difficulty] = sssCount;

      // 神 (Shin): AP or above
      const apCount = (diffData.fc["ap"] || 0) + (diffData.fc["ap+"] || 0);
      progress.shin[difficulty] = apCount;

      // 舞舞 (Maimai): FDX or above
      const fdxCount = (diffData.fs["fdx"] || 0) + (diffData.fs["fdx+"] || 0);
      progress.maimai[difficulty] = fdxCount;
    }

    return { progress, totalSongs };
  }, [data, selectedVersion]);

  if (!plateProgress) {
    return (
      <div className="text-center text-muted-foreground py-8">
        {t('playerStats.selectVersionForPlates')}
      </div>
    );
  }

  const { progress, totalSongs } = plateProgress;
  const mainDifficulties = ["basic", "advanced", "expert", "master"];

  return (
    <div className="space-y-6">
      {(Object.keys(PLATE_LABELS) as PlateType[]).map((plateType, plateIndex) => {
        const plateLabel = PLATE_LABELS[plateType];
        const plateDescription = t(`playerStats.plates.${plateType}`);

        return (
          <motion.div
            key={plateType}
            initial={{ opacity: 0, ...(isDesktop ? { x: -10 } : { y: 10 }) }}
            animate={{ opacity: 1, x: 0, y: 0 }}
            transition={{
              duration: 0.3,
              delay: STAGGER.calculateDelay(plateIndex, 0.08),
              ease: [0.4, 0, 0.2, 1],
            }}
            className="space-y-3"
          >
            <div className="flex items-center gap-2 sm:gap-3">
              <div className={cn(
                "flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 text-xl sm:text-2xl font-bold bg-muted rounded-sm border-2 flex-shrink-0",
                plateLabel.length === 2 && "text-base sm:text-lg"
              )}>
                {plateLabel}
              </div>
              <div className="min-w-0">
                <h4 className="font-semibold text-sm sm:text-base truncate">{plateDescription}</h4>
              </div>
            </div>

            <div className="space-y-2">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {mainDifficulties.map((difficulty, diffIndex) => {
                  const count = progress[plateType][difficulty] || 0;
                  const total = totalSongs[difficulty] || 0;
                  const percentage = total > 0 ? (count / total) * 100 : 0;
                  const isComplete = count === total && total > 0;
                  const diffColor = DIFFICULTY_COLORS[difficulty as keyof typeof DIFFICULTY_COLORS];
                  const isExpanded = expandedCell?.plateType === plateType && expandedCell?.difficulty === difficulty;
                  const notMeetingCount = total - count;

                  return (
                    <button
                      key={difficulty}
                      onClick={() => {
                        if (isExpanded) {
                          setExpandedCell(null);
                        } else if (notMeetingCount > 0) {
                          setExpandedCell({ plateType, difficulty });
                        }
                      }}
                      disabled={notMeetingCount === 0}
                      className={`p-3 sm:p-4 rounded-lg border-2 transition-all duration-200 text-left relative group ${isComplete
                        ? `${diffColor.border} bg-gradient-to-br from-green-500/20 to-emerald-500/20`
                        : isExpanded
                          ? `${diffColor.border} bg-muted`
                          : "border-border bg-muted/50 hover:bg-muted hover:border-muted-foreground/30"
                        } ${notMeetingCount > 0 ? "cursor-pointer active:scale-95" : "cursor-default"}`}
                    >
                      <div className="text-center space-y-1 sm:space-y-2">
                        <div className={`text-[10px] sm:text-xs font-bold uppercase ${diffColor.text}`}>
                          {t(`common.difficulties.${difficulty}`)}
                        </div>
                        <div className="text-xl sm:text-2xl font-bold">
                          {count}
                          <span className="text-xs sm:text-sm text-muted-foreground">/{total}</span>
                        </div>
                        <Progress value={percentage} className="h-1" />
                      </div>
                      {notMeetingCount > 0 && (
                        <ChevronRight
                          className={`absolute right-1 sm:right-2 top-1/2 -translate-y-1/2 h-5 w-5 sm:h-6 sm:w-6 text-muted-foreground transition-all duration-300 ease-out ${isExpanded ? "rotate-90" : "group-hover:translate-x-1"
                            }`}
                        />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Expanded Songs View */}
              <AnimatePresence>
                {mainDifficulties.map((difficulty) => {
                  const isExpanded = expandedCell?.plateType === plateType && expandedCell?.difficulty === difficulty;
                  if (!isExpanded) return null;

                  return (
                    <motion.div
                      key={`${plateType}-${difficulty}-expanded`}
                      initial={{ opacity: 0, height: 0, scale: 0.95 }}
                      animate={{ opacity: 1, height: "auto", scale: 1 }}
                      exit={{ opacity: 0, height: 0, scale: 0.95 }}
                      transition={{
                        duration: 0.4,
                        ease: [0.4, 0, 0.2, 1],
                      }}
                    >
                      <div className="bg-muted/30 rounded-lg border border-border">
                        <AutoHeight deps={[isSongsLoading, plateSongs]} className="p-3 sm:p-4">
                          <h5 className="text-xs sm:text-sm font-semibold mb-2 sm:mb-3">
                            {t('playerStats.songsNotMeeting', { requirement: t(`playerStats.plates.${plateType}`) })}
                          </h5>
                          {isSongsLoading ? (
                            <div className="flex justify-center py-8">
                              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                            </div>
                          ) : plateSongs && plateSongs.length > 0 ? (
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 sm:gap-3">
                              {plateSongs.map((song: any, songIndex: number) => (
                                <SongGridCard song={song} />
                              ))}
                            </div>
                          ) : (
                            <p className="text-center text-muted-foreground py-4">
                              {t('playerStats.noSongsToDisplay')}
                            </p>
                          )}
                        </AutoHeight>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}


export function StatsCard({ region, selectedSnapshotData, snapshotId }: StatsCardProps) {
  const t = useTranslations();
  const { data: ownData, isLoading: ownLoading } = trpc.user.getPlayerStats.useQuery(
    { region },
    { enabled: !snapshotId }
  );
  const { data: publicData, isLoading: publicLoading } = trpc.user.getPublicPlayerStats.useQuery(
    { snapshotId: snapshotId!, region },
    { enabled: !!snapshotId }
  );
  const data = snapshotId ? publicData : ownData;
  const isLoading = snapshotId ? publicLoading : ownLoading;

  const [selectedVersion, setSelectedVersion] = useState<string>("all");
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"stats" | "plates">("stats");

  const levelBreakdown = useMemo<LevelBreakdown | null>(() => {
    if (!data) return null;
    const byLevel = new Map<string, Counts>();
    for (const [version, difficulties] of Object.entries(data.levels)) {
      if (selectedVersion !== "all" && version !== selectedVersion) continue;
      for (const [difficulty, levels] of Object.entries(difficulties)) {
        if (selectedDifficulty !== "all" && difficulty !== selectedDifficulty) continue;
        for (const [level, bucket] of Object.entries(levels)) {
          if (!byLevel.has(level)) byLevel.set(level, emptyCounts());
          mergeCounts(byLevel.get(level)!, bucket);
        }
      }
    }

    const levels = [...byLevel.keys()].sort((a, b) => levelValue(b) - levelValue(a));
    const toRow = (level: string): LevelRow => ({ ...byLevel.get(level)!, key: level, label: t('playerStats.level', { level }) });
    const all: LevelRow = { ...emptyCounts(), key: "all", label: t('playerStats.allLevels') };
    for (const counts of byLevel.values()) mergeCounts(all, counts);

    const rest = levels.slice(MAX_LEVEL_ROWS).map(toRow);
    let group: LevelRow | null = null;
    if (rest.length > 0) {
      group = { ...emptyCounts(), key: "rest", label: t('playerStats.levelAndBelow', { level: rest[0].key }) };
      for (const row of rest) mergeCounts(group, row);
    }
    return { all, top: levels.slice(0, MAX_LEVEL_ROWS).map(toRow), group, rest };
  }, [data, selectedVersion, selectedDifficulty, t]);

  // Get available versions from data
  const availableVersions = useMemo(() => {
    if (!data) return [];
    return Object.keys(data.stats).map(versionId => {
      const versionInfo = getVersionInfo(parseInt(versionId) as any);
      return {
        id: versionId,
        name: versionInfo?.shortName || `Version ${versionId}`,
      };
    }).sort((a, b) => parseInt(a.id) - parseInt(b.id));
  }, [data]);

  // Get all difficulties in proper order
  const availableDifficulties = useMemo(() => {
    return DIFFICULTY_ENUM;
  }, []);

  if (isLoading) {
    return <StatsCardSkeleton />;
  }

  if (!data || Object.keys(data.stats).length === 0) {
    return (
      <div className="p-8 text-center w-full h-[calc(100vh-20rem)] flex flex-col items-center justify-center">
        <p className="text-muted-foreground">{t('playerStats.noDataAvailable')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">{t('playerStats.title')}</h2>
        <div className="flex flex-col sm:flex-row gap-2 mt-4">
          <Select value={selectedVersion} onValueChange={setSelectedVersion}>
            <SelectTrigger className="w-full sm:w-[200px]">
              <SelectValue placeholder={t('playerStats.selectVersion')} />
            </SelectTrigger>
            <SelectContent label={t('playerStats.selectVersion')}>
              <SelectItem value="all">{t('playerStats.allVersions')}</SelectItem>
              {availableVersions.map(version => (
                <SelectItem key={version.id} value={version.id}>
                  {version.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {viewMode === "stats" && (
            <Select value={selectedDifficulty} onValueChange={setSelectedDifficulty}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue placeholder={t('playerStats.selectDifficulty')} />
              </SelectTrigger>
              <SelectContent label={t('playerStats.selectDifficulty')}>
                <SelectItem value="all">{t('playerStats.allDifficulties')}</SelectItem>
                {DIFFICULTY_ENUM.map(difficulty => (
                  <SelectItem key={difficulty} value={difficulty}>
                    {t(`common.difficulties.${difficulty}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <div className="flex-1" />

          <Button
            variant={viewMode === "plates" ? "outline" : "default"}
            size="sm"
            onClick={() => setViewMode(viewMode === "stats" ? "plates" : "stats")}
            className="w-full sm:w-auto"
          >
            {viewMode === "plates" ? (
              <>
                <ArrowLeft className="h-4 w-4 mr-2" />
                {t('playerStats.backToStats')}
              </>
            ) : (
              <>
                <Award className="h-4 w-4 mr-2" />
                {t('playerStats.viewPlatesProgress')}
              </>
            )}
          </Button>
        </div>
      </div>
      <div className="space-y-8">
        {viewMode === "plates" ? (
          <PlatesGrid data={data} selectedVersion={selectedVersion} region={region} snapshotId={snapshotId} />
        ) : (
          <>
            {!levelBreakdown || levelBreakdown.all.charts === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                {t('playerStats.noMatchingScores')}
              </p>
            ) : (
              <>
                <StatsSection title={t('playerStats.achievementGrades')} breakdown={levelBreakdown} tiers={GRADE_TIERS} field="grades" />
                <StatsSection title={t('playerStats.fullCombo')} breakdown={levelBreakdown} tiers={FC_TIERS} field="fc" />
                <StatsSection title={t('playerStats.fullSync')} breakdown={levelBreakdown} tiers={FS_TIERS} field="fs" />
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
