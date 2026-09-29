"use client";

import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@tomomai/ui";
import { useCallback, useEffect, useState } from "react";
import { Input } from "@tomomai/ui";
import { Label } from "@tomomai/ui";
import { Button } from "@tomomai/ui";
import { useGame } from "@/components/providers/game-provider";
import { getCurrentVersion } from "@/lib/games/versions";
import type { Region } from "@/lib/types";
import { UsersBrowserDialog } from "./users-browser-dialog";
import { ProfileReportsDialog } from "./profile-reports-dialog";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

interface AdminDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const REGION_GRID_COLUMNS = ["grid-cols-1", "grid-cols-2", "grid-cols-3"];

export function AdminDialog({ open, onOpenChange }: AdminDialogProps) {
  const game = useGame();
  const [adminToken, setAdminToken] = useState("");
  const [sourceToken, setSourceToken] = useState("");
  const [newSongs, setNewSongs] = useState<object[]>([]);
  const [consoleLog, setConsoleLog] = useState("Welcome to the admin panel!\n");
  const [usersBrowserOpen, setUsersBrowserOpen] = useState(false);
  const [profileReportsOpen, setProfileReportsOpen] = useState(false);
  const profileReportsT = useTranslations("Admin.profileReports");
  const regionT = useTranslations("regions");

  const sourceTokenKey = `catalogSourceToken:${game.id}`;
  const regionGrid = REGION_GRID_COLUMNS[Math.min(game.regions.length, REGION_GRID_COLUMNS.length) - 1];
  const needsSourceToken = game.regions.some(region => game.catalogTokenRegions.includes(region));
  const regionButtonLabel = (region: Region) => `${regionT(region)} (v${getCurrentVersion(game.id, region)})`;

  // Load tokens from localStorage on mount
  useEffect(() => {
    const savedAdminToken = localStorage.getItem("adminToken");
    const savedSourceToken = localStorage.getItem(sourceTokenKey);
    if (savedAdminToken) {
      setAdminToken(savedAdminToken);
    }
    if (savedSourceToken) {
      setSourceToken(savedSourceToken);
    }
  }, [sourceTokenKey]);

  // Save admin token to localStorage whenever it changes
  useEffect(() => {
    if (adminToken) {
      localStorage.setItem("adminToken", adminToken);
    }
  }, [adminToken]);

  useEffect(() => {
    if (sourceToken) {
      localStorage.setItem(sourceTokenKey, sourceToken);
    }
  }, [sourceToken, sourceTokenKey]);

  const appendConsoleLog = useCallback((log: string) => {
    setConsoleLog(old => old + log + "\n");
  }, [setConsoleLog]);

  function handleNormalizeDatabase(region: Region) {
    appendConsoleLog("Normalizing database for region " + region + "...");
    fetch(`/api/admin/db?game=${game.id}&type=normalize&region=${region}`, {
      method: "GET",
      headers: { "Authorization": "Bearer " + adminToken }
    }).then(async data => {
      appendConsoleLog(`Response ${data.status} ${data.statusText}:`);
      const text = await data.text();
      try {
        const json = JSON.parse(text);
        appendConsoleLog(JSON.stringify(json, null, 2));
      } catch (_) {
        appendConsoleLog(text);
      }
    }).catch(error => {
      appendConsoleLog("Error: " + error.message);
    });
  }

  function handleFetchSongs(region: Region) {
    appendConsoleLog("Fetching new songs for region " + region + "...");
    const token = game.catalogTokenRegions.includes(region) ? `&token=${encodeURIComponent(sourceToken)}` : "";
    fetch(`/api/admin/update?game=${game.id}&region=${region}${token}`, {
      method: "GET",
      headers: { "Authorization": "Bearer " + adminToken }
    }).then(async data => {
      appendConsoleLog(`Response ${data.status} ${data.statusText}:`);
      const text = await data.text();
      try {
        const json = JSON.parse(text);
        if (json.success) {
          appendConsoleLog(`New songs fetched successfully: ${json.records.length} songs`);
          setNewSongs(json.records);
        } else {
          appendConsoleLog(JSON.stringify(json, null, 2));
        }
      } catch (_) {
        appendConsoleLog(text);
      }
    }).catch(error => {
      appendConsoleLog("Error: " + error.message);
    });
  }

  function handlePreviewChanges(region: Region) {
    if (newSongs.length === 0) {
      appendConsoleLog("Error: No new songs loaded. Please fetch songs first.");
      return;
    }

    const version = getCurrentVersion(game.id, region);
    appendConsoleLog(`Previewing changes for ${region} v${version} (${newSongs.length} songs)...`);

    fetch(`/api/admin/upload?game=${game.id}&region=${region}&version=${version}&update=noop`, {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + adminToken,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ songs: newSongs }),
    }).then(async data => {
      appendConsoleLog(`Response ${data.status} ${data.statusText}:`);
      const text = await data.text();
      try {
        const json = JSON.parse(text);
        if (json.success) {
          appendConsoleLog("=== PREVIEW RESULTS ===");
          appendConsoleLog(`Statistics:`);
          appendConsoleLog(`  Input songs: ${json.statistics.inputSongs}`);
          appendConsoleLog(`  DB songs: ${json.statistics.dbSongs}`);
          appendConsoleLog(`  Merged songs: ${json.statistics.mergedSongs}`);
          appendConsoleLog(`  Added: ${json.statistics.added}`);
          appendConsoleLog(`  Modified: ${json.statistics.modified}`);
          appendConsoleLog(`  Deleted: ${json.statistics.deleted}`);
          appendConsoleLog(`  Unchanged: ${json.statistics.unchanged}`);

          if (json.changes.deleted.length > 0) {
            appendConsoleLog(`\nDeleted songs (${json.changes.deleted.length}):`);
            json.changes.deleted.forEach((song: any) => {
              const playCount = song.playRecordCount != null ? ` | ${song.playRecordCount} plays` : "";
              appendConsoleLog(`  - ${song.label} | ${song.level} | ${song.artist} (dbId: ${song.dbId})${playCount}`);
            });
          }

          if (json.changes.added.length > 0) {
            appendConsoleLog(`\nAdded songs (${json.changes.added.length}):`);
            json.changes.added.forEach((song: any) => {
              appendConsoleLog(`  + ${song.label} | ${song.level} | ${song.artist}`);
            });
          }

          if (json.changes.modified.length > 0) {
            // Group changes by field type
            const changesByField: Record<string, Array<{ label: string; oldValue: any; newValue: any; levelPreciseOld?: any; levelPreciseNew?: any }>> = {};

            json.changes.modified.forEach((song: any) => {
              const levelChange = song.fieldChanges.find((c: any) => c.field === "level");
              const levelPreciseChange = song.fieldChanges.find((c: any) => c.field === "levelPrecise");

              // Handle level and levelPrecise together
              if (levelChange || levelPreciseChange) {
                if (!changesByField["level"]) changesByField["level"] = [];
                changesByField["level"].push({
                  label: song.label,
                  oldValue: levelChange?.oldValue,
                  newValue: levelChange?.newValue,
                  levelPreciseOld: levelPreciseChange?.oldValue,
                  levelPreciseNew: levelPreciseChange?.newValue
                });
              }

              // Handle other fields separately
              song.fieldChanges.forEach((change: any) => {
                if (change.field !== "level" && change.field !== "levelPrecise") {
                  if (!changesByField[change.field]) changesByField[change.field] = [];
                  changesByField[change.field].push({
                    label: song.label,
                    oldValue: change.oldValue,
                    newValue: change.newValue
                  });
                }
              });
            });

            appendConsoleLog(`\nModified songs (${json.changes.modified.length}) grouped by field:\n`);

            // Display level changes first (with levelPrecise)
            if (changesByField["level"]) {
              appendConsoleLog(`Level Changes (${changesByField["level"].length}):`);
              changesByField["level"].forEach((change: any) => {
                let msg = `  ${change.label}`;
                if (change.oldValue !== undefined || change.newValue !== undefined) {
                  msg += ` | Level: ${change.oldValue || "?"} → ${change.newValue || "?"}`;
                }
                if (change.levelPreciseOld !== undefined || change.levelPreciseNew !== undefined) {
                  msg += ` | Precise: ${change.levelPreciseOld || "?"} → ${change.levelPreciseNew || "?"}`;
                }
                appendConsoleLog(msg);
              });
              appendConsoleLog("");
            }

            // Display other field changes
            const otherFields = Object.keys(changesByField).filter(f => f !== "level").sort();
            for (const field of otherFields) {
              const changes = changesByField[field];
              appendConsoleLog(`${field.charAt(0).toUpperCase() + field.slice(1)} Changes (${changes.length}):`);
              changes.forEach((change: any) => {
                const oldVal = typeof change.oldValue === "object" ? JSON.stringify(change.oldValue) : change.oldValue;
                const newVal = typeof change.newValue === "object" ? JSON.stringify(change.newValue) : change.newValue;
                appendConsoleLog(`  ${change.label} | ${oldVal} → ${newVal}`);
              });
              appendConsoleLog("");
            }
          }

          appendConsoleLog("=== END PREVIEW ===");
        } else {
          appendConsoleLog(JSON.stringify(json, null, 2));
        }
      } catch (_) {
        appendConsoleLog(text);
      }
    }).catch(error => {
      appendConsoleLog("Error: " + error.message);
    });
  }

  const handleAdminDialogChange = (newOpen: boolean) => {
    if (usersBrowserOpen || profileReportsOpen) return;
    onOpenChange(newOpen);
  };

  return (
    <>
      <ResponsiveDialog open={open} onOpenChange={handleAdminDialogChange}>
        <ResponsiveDialogContent className={cn("max-w-2xl max-h-[80vh] overflow-y-auto transition-[opacity,scale] duration-200", usersBrowserOpen || profileReportsOpen ? "opacity-70 scale-95" : "")}>
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>{game.brand.japaneseName} Admin Panel</ResponsiveDialogTitle>
            <ResponsiveDialogDescription>
              Modifying the database and other admin-only features.
            </ResponsiveDialogDescription>
          </ResponsiveDialogHeader>

          <div className="space-y-6">
            <div className="grid gap-2">
              <Label htmlFor="adminToken">Admin Token</Label>
              <Input
                id="adminToken"
                value={adminToken}
                onChange={(e) => setAdminToken(e.target.value)}
              />
            </div>

            <div className="grid gap-2">
              <Label>User Management</Label>
              <Button
                id="browseUsers"
                variant="outline"
                onClick={() => setUsersBrowserOpen(true)}
              >
                Browse All Users
              </Button>
            </div>

            <div className="grid gap-2">
              <Label>{profileReportsT("sectionLabel")}</Label>
              <Button
                id="reviewProfileReports"
                variant="outline"
                onClick={() => setProfileReportsOpen(true)}
              >
                {profileReportsT("open")}
              </Button>
            </div>

            <div className="grid gap-2">
              <Label>Normalize Database</Label>
              <div className={cn("grid gap-2", regionGrid)}>
                {game.regions.map(region => (
                  <Button
                    key={region}
                    id={`normalize-${region}-database`}
                    variant="outline"
                    onClick={() => handleNormalizeDatabase(region)}
                  >
                    {regionButtonLabel(region)}
                  </Button>
                ))}
              </div>
            </div>

            {needsSourceToken && (
              <div className="grid gap-2">
                <Label htmlFor="sourceToken">{game.brand.netName} Token</Label>
                <span className="text-sm text-muted-foreground">
                  This is the token you use to fetch data from {game.brand.netName}.
                  <br />
                  This can be account://&lt;username&gt;:://&lt;password&gt; or cookie://&lt;token&gt;
                </span>
                <Input
                  id="sourceToken"
                  value={sourceToken}
                  onChange={(e) => setSourceToken(e.target.value)}
                />
              </div>
            )}

            <div className="grid gap-2">
              <Label>Fetch New Songs</Label>
              <span className="text-sm text-muted-foreground">
                This will fetch songs using the full catalog pipeline.
                <br />
                Current new songs: {newSongs.length}
              </span>
              <div className={cn("grid gap-2", regionGrid)}>
                {game.regions.map(region => (
                  <Button
                    key={region}
                    id={`fetch-${region}-new-songs`}
                    variant="outline"
                    onClick={() => handleFetchSongs(region)}
                  >
                    Fetch {regionButtonLabel(region)}
                  </Button>
                ))}
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Preview Changes</Label>
              <span className="text-sm text-muted-foreground">
                Preview what changes would be made to the database without actually updating it.
              </span>
              <div className={cn("grid gap-2", regionGrid)}>
                {game.regions.map(region => (
                  <Button
                    key={region}
                    id={`preview-${region}-changes`}
                    variant="outline"
                    onClick={() => handlePreviewChanges(region)}
                    disabled={newSongs.length === 0}
                  >
                    Preview {regionButtonLabel(region)}
                  </Button>
                ))}
              </div>
            </div>

            <div className="p-2 bg-gray-200/70 rounded-md text-sm font-mono text-muted-foreground break-all h-[200px] w-full whitespace-pre overflow-y-auto">
              {consoleLog}
            </div>

            <div className="pt-4 border-t">
              <p className="text-center text-sm text-muted-foreground">
                Built with ❤️ for the {game.brand.displayName} community
              </p>
            </div>
          </div>
        </ResponsiveDialogContent>
      </ResponsiveDialog>

      <UsersBrowserDialog
        open={usersBrowserOpen}
        onOpenChange={setUsersBrowserOpen}
        adminToken={adminToken}
      />

      <ProfileReportsDialog
        open={profileReportsOpen}
        onOpenChange={setProfileReportsOpen}
        adminToken={adminToken}
      />
    </>
  );
}
