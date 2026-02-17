"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select-friendly";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { ACHIEVEMENTS, DIFFICULTY_COLORS } from "@/lib/difficulty";
import { DIFFICULTY_ENUM, FC_ENUM, FS_ENUM } from "@/lib/db/types";
import { getVersionInfo, VERSIONS } from "@/lib/metadata";
import { Region, SnapshotWithSongs } from "@/lib/types";
import { trpc } from "@/lib/trpc-client";
import { ArrowLeft, Award, ChevronRight, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { STAGGER } from "@/lib/animation-constants";
import { SongGridCard } from "@/components/songs-card";
import { AutoHeight } from "./animate-ui/primitives/effects/auto-height";
import { cn } from "@/lib/utils";

interface StatsCardProps {
  region: Region;
  selectedSnapshotData: SnapshotWithSongs | null;
  snapshotId?: string;
}

// Grade colors for display
const GRADE_COLORS: Record<string, { bg: string; text: string }> = {
  "SSS+": { bg: "bg-yellow-500", text: "text-yellow-600" },
  "SSS": { bg: "bg-yellow-500", text: "text-yellow-600" },
  "SS+": { bg: "bg-orange-500", text: "text-orange-600" },
  "SS": { bg: "bg-orange-500", text: "text-orange-600" },
  "S+": { bg: "bg-red-500", text: "text-red-600" },
  "S": { bg: "bg-red-500", text: "text-red-600" },
  "AAA": { bg: "bg-purple-500", text: "text-purple-600" },
  "AA": { bg: "bg-purple-500", text: "text-purple-600" },
  "A": { bg: "bg-blue-500", text: "text-blue-600" },
  "BBB": { bg: "bg-green-500", text: "text-green-600" },
  "BB": { bg: "bg-green-500", text: "text-green-600" },
  "B": { bg: "bg-emerald-500", text: "text-emerald-600" },
  "C": { bg: "bg-gray-500", text: "text-gray-600" },
  "D": { bg: "bg-gray-400", text: "text-gray-500" },
};

// FC colors for display
const FC_COLORS: Record<string, { bg: string; text: string }> = {
  "ap+": { bg: "bg-yellow-500", text: "text-yellow-600" },
  "ap": { bg: "bg-yellow-600", text: "text-yellow-700" },
  "fc+": { bg: "bg-green-500", text: "text-green-600" },
  "fc": { bg: "bg-green-600", text: "text-green-700" },
};

// FS colors for display
const FS_COLORS: Record<string, { bg: string; text: string }> = {
  "fdx+": { bg: "bg-purple-400", text: "text-purple-500" },
  "fdx": { bg: "bg-purple-500", text: "text-purple-600" },
  "fs+": { bg: "bg-blue-400", text: "text-blue-500" },
  "fs": { bg: "bg-blue-500", text: "text-blue-600" },
  "sync": { bg: "bg-cyan-500", text: "text-cyan-600" },
};

// FC and FS order (from best to worst, excluding "none")
const FC_ORDER = FC_ENUM.filter(fc => fc !== "none").reverse();
const FS_ORDER = FS_ENUM.filter(fs => fs !== "none").reverse();

// FC and FS labels
const FC_LABELS: Record<string, string> = {
  "fc": "FC",
  "fc+": "FC+",
  "ap": "AP",
  "ap+": "AP+",
};

const FS_LABELS: Record<string, string> = {
  "sync": "Sync",
  "fs": "FS",
  "fs+": "FS+",
  "fdx": "FDX",
  "fdx+": "FDX+",
};

// Plate types
type PlateType = "kyoku" | "shou" | "shin" | "maimai";
const PLATE_INFO: Record<PlateType, { label: string; description: string }> = {
  kyoku: { label: "極", description: "All FC or above" },
  shou: { label: "将", description: "All SSS or above" },
  shin: { label: "神", description: "All AP or above" },
  maimai: { label: "舞舞", description: "All FDX or above" },
};

// Plates Grid Component
interface PlatesGridProps {
  data: any;
  selectedVersion: string;
  region: Region;
}

function PlatesGrid({ data, selectedVersion, region }: PlatesGridProps) {
  const t = useTranslations();
  const [expandedCell, setExpandedCell] = useState<{ plateType: PlateType; difficulty: string } | null>(null);

  // Fetch songs for expanded cell
  const { data: plateSongs, isLoading: isSongsLoading } = trpc.user.getPlateSongs.useQuery(
    {
      region,
      version: selectedVersion,
      difficulty: expandedCell?.difficulty as any,
      plateType: expandedCell?.plateType as any,
    },
    {
      enabled: expandedCell !== null && selectedVersion !== "all",
    }
  );

  // Calculate plate progress for a specific version
  const plateProgress = useMemo(() => {
    if (!data || selectedVersion === "all") return null;

    const versionData = data.stats[selectedVersion];
    if (!versionData) return null;

    // Difficulties to check (Basic to Master)
    const mainDifficulties = ["basic", "advanced", "expert", "master"];
    const totalSongs: Record<string, number> = {};
    const progress: Record<PlateType, Record<string, number>> = {
      kyoku: {},
      shou: {},
      shin: {},
      maimai: {},
    };

    // Initialize counts
    for (const difficulty of mainDifficulties) {
      totalSongs[difficulty] = data.totalSongs[selectedVersion]?.[difficulty] || 0;
      progress.kyoku[difficulty] = 0;
      progress.shou[difficulty] = 0;
      progress.shin[difficulty] = 0;
      progress.maimai[difficulty] = 0;
    }

    // Calculate progress for each plate type
    for (const difficulty of mainDifficulties) {
      const diffData = versionData[difficulty];
      if (!diffData) continue;

      // 極 (Kyoku): FC or above
      const fcCount = (diffData.fc["fc"] || 0) + (diffData.fc["fc+"] || 0) +
        (diffData.fc["ap"] || 0) + (diffData.fc["ap+"] || 0);
      progress.kyoku[difficulty] = fcCount;

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
        Please select a specific version to view plate progress
      </div>
    );
  }

  const { progress, totalSongs } = plateProgress;
  const mainDifficulties = ["basic", "advanced", "expert", "master"];

  return (
    <div className="space-y-6">
      {(Object.keys(PLATE_INFO) as PlateType[]).map((plateType, plateIndex) => {
        const plateInfo = PLATE_INFO[plateType];

        return (
          <motion.div
            key={plateType}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
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
                plateInfo.label.length === 2 && "text-base sm:text-lg"
              )}>
                {plateInfo.label}
              </div>
              <div className="min-w-0">
                <h4 className="font-semibold text-sm sm:text-base truncate">{plateInfo.description}</h4>
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
                            Songs not meeting {PLATE_INFO[plateType].description.toLowerCase()}
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
                              No songs to display
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

  // Compute filtered stats
  const filteredStats = useMemo(() => {
    if (!data) return { grades: {}, fc: {}, fs: {}, scoredTotal: 0, dbTotal: 0 };

    const aggregatedGrades: Record<string, number> = {};
    const aggregatedFC: Record<string, number> = {};
    const aggregatedFS: Record<string, number> = {};
    let scoredTotal = 0;
    let dbTotal = 0;

    // Aggregate across all versions and difficulties based on filters
    for (const [version, difficulties] of Object.entries(data.stats)) {
      // Skip if version filter is active and doesn't match
      if (selectedVersion !== "all" && version !== selectedVersion) {
        continue;
      }

      for (const [difficulty, stats] of Object.entries(difficulties)) {
        // Skip if difficulty filter is active and doesn't match
        if (selectedDifficulty !== "all" && difficulty !== selectedDifficulty) {
          continue;
        }

        // Aggregate grade counts
        for (const [grade, count] of Object.entries(stats.grades)) {
          aggregatedGrades[grade] = (aggregatedGrades[grade] || 0) + count;
        }

        // Aggregate FC counts
        for (const [fc, count] of Object.entries(stats.fc)) {
          aggregatedFC[fc] = (aggregatedFC[fc] || 0) + count;
        }

        // Aggregate FS counts
        for (const [fs, count] of Object.entries(stats.fs)) {
          aggregatedFS[fs] = (aggregatedFS[fs] || 0) + count;
        }

        scoredTotal += stats.total;
      }
    }

    // Calculate total songs in database based on filters
    for (const [version, difficulties] of Object.entries(data.totalSongs)) {
      // Skip if version filter is active and doesn't match
      if (selectedVersion !== "all" && version !== selectedVersion) {
        continue;
      }

      for (const [difficulty, count] of Object.entries(difficulties)) {
        // Skip if difficulty filter is active and doesn't match
        if (selectedDifficulty !== "all" && difficulty !== selectedDifficulty) {
          continue;
        }

        dbTotal += count;
      }
    }

    // Make grades cumulative (each grade includes all better grades)
    const gradeOrder = ACHIEVEMENTS.map(a => a.rate);
    const cumulativeGrades: Record<string, number> = {};
    let gradRunningTotal = 0;

    for (const grade of gradeOrder) {
      gradRunningTotal += aggregatedGrades[grade] || 0;
      cumulativeGrades[grade] = gradRunningTotal;
    }

    // Make FC cumulative (each FC includes all better FCs)
    const cumulativeFC: Record<string, number> = {};
    let fcRunningTotal = 0;

    for (const fc of FC_ORDER) {
      fcRunningTotal += aggregatedFC[fc] || 0;
      cumulativeFC[fc] = fcRunningTotal;
    }

    // Make FS cumulative (each FS includes all better FSs)
    const cumulativeFS: Record<string, number> = {};
    let fsRunningTotal = 0;

    for (const fs of FS_ORDER) {
      fsRunningTotal += aggregatedFS[fs] || 0;
      cumulativeFS[fs] = fsRunningTotal;
    }

    return { grades: cumulativeGrades, fc: cumulativeFC, fs: cumulativeFS, scoredTotal, dbTotal };
  }, [data, selectedVersion, selectedDifficulty]);

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

  // Sort grades by achievement threshold (highest to lowest)
  const sortedGrades = useMemo(() => {
    const gradeOrder = ACHIEVEMENTS.map(a => a.rate);
    return Object.entries(filteredStats.grades)
      .sort((a, b) => {
        const indexA = gradeOrder.indexOf(a[0]);
        const indexB = gradeOrder.indexOf(b[0]);
        return indexA - indexB;
      });
  }, [filteredStats.grades]);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-8 text-center w-full h-[calc(100vh-20rem)] flex flex-col items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!data || Object.keys(data.stats).length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center w-full h-[calc(100vh-20rem)] flex flex-col items-center justify-center">
          <p className="text-muted-foreground">No data available</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Player Statistics</CardTitle>
        <div className="flex flex-col sm:flex-row gap-2 mt-4">
          <Select value={selectedVersion} onValueChange={setSelectedVersion}>
            <SelectTrigger className="w-full sm:w-[200px]">
              <SelectValue placeholder="Select version" />
            </SelectTrigger>
            <SelectContent label="Select version">
              <SelectItem value="all">All Versions</SelectItem>
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
                <SelectValue placeholder="Select difficulty" />
              </SelectTrigger>
              <SelectContent label="Select difficulty">
                <SelectItem value="all">All Difficulties</SelectItem>
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
                Back to Stats
              </>
            ) : (
              <>
                <Award className="h-4 w-4 mr-2" />
                View Plates Progress
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-8">
        {viewMode === "plates" ? (
          <PlatesGrid data={data} selectedVersion={selectedVersion} region={region} />
        ) : (
          <>
            {/* Grades Section */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Achievement Grades</h3>
              {sortedGrades.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No scores match the selected filters
                </p>
              ) : (
                sortedGrades.map(([grade, count], index) => {
                  const percentage = filteredStats.dbTotal > 0 ? (count / filteredStats.dbTotal) * 100 : 0;
                  const gradeColor = GRADE_COLORS[grade] || GRADE_COLORS["D"];

                  return (
                    <motion.div
                      key={grade}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{
                        duration: 0.2,
                        delay: STAGGER.calculateDelay(index, 0.03),
                      }}
                      className="space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-flex items-center justify-center w-12 h-6 text-xs font-bold text-white rounded ${gradeColor.bg}`}
                          >
                            {grade}
                          </span>
                          <span className="text-sm font-medium">
                            {count.toLocaleString()} / {filteredStats.dbTotal.toLocaleString()}
                          </span>
                        </div>
                        <span className="text-sm text-muted-foreground">
                          {percentage.toFixed(1)}%
                        </span>
                      </div>
                      <Progress value={percentage} className="h-2" />
                    </motion.div>
                  );
                })
              )}
            </div>

            {/* Full Combo Section */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Full Combo</h3>
              {FC_ORDER.map((fc, index) => {
                const count = filteredStats.fc[fc] || 0;
                const percentage = filteredStats.dbTotal > 0 ? (count / filteredStats.dbTotal) * 100 : 0;
                const fcColor = FC_COLORS[fc];

                if (count === 0) return null;

                return (
                  <motion.div
                    key={fc}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{
                      duration: 0.2,
                      delay: STAGGER.calculateDelay(index, 0.03),
                    }}
                    className="space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex items-center justify-center w-12 h-6 text-xs font-bold text-white rounded ${fcColor.bg}`}
                        >
                          {FC_LABELS[fc]}
                        </span>
                        <span className="text-sm font-medium">
                          {count.toLocaleString()} / {filteredStats.dbTotal.toLocaleString()}
                        </span>
                      </div>
                      <span className="text-sm text-muted-foreground">
                        {percentage.toFixed(1)}%
                      </span>
                    </div>
                    <Progress value={percentage} className="h-2" />
                  </motion.div>
                );
              })}
            </div>

            {/* Full Sync Section */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Full Sync</h3>
              {FS_ORDER.map((fs, index) => {
                const count = filteredStats.fs[fs] || 0;
                const percentage = filteredStats.dbTotal > 0 ? (count / filteredStats.dbTotal) * 100 : 0;
                const fsColor = FS_COLORS[fs];

                if (count === 0) return null;

                return (
                  <motion.div
                    key={fs}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{
                      duration: 0.2,
                      delay: STAGGER.calculateDelay(index, 0.03),
                    }}
                    className="space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex items-center justify-center w-12 h-6 text-xs font-bold text-white rounded ${fsColor.bg}`}
                        >
                          {FS_LABELS[fs]}
                        </span>
                        <span className="text-sm font-medium">
                          {count.toLocaleString()} / {filteredStats.dbTotal.toLocaleString()}
                        </span>
                      </div>
                      <span className="text-sm text-muted-foreground">
                        {percentage.toFixed(1)}%
                      </span>
                    </div>
                    <Progress value={percentage} className="h-2" />
                  </motion.div>
                );
              })}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
