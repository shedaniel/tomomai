"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Button } from "../ui/button";
import { getCurrentVersion } from "@/lib/metadata";
import { UsersBrowserDialog } from "./users-browser-dialog";
import { cn } from "@/lib/utils";

interface AdminDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AdminDialog({ open, onOpenChange }: AdminDialogProps) {
  const [adminToken, setAdminToken] = useState("");
  const [maimaiToken, setMaimaiToken] = useState("");
  const [fallbackSongs, setFallbackSongs] = useState<object[]>([]);
  const [newSongs, setNewSongs] = useState<object[]>([]);
  const [consoleLog, setConsoleLog] = useState("Welcome to the admin panel!\n");
  const [usersBrowserOpen, setUsersBrowserOpen] = useState(false);

  const intlVersion = getCurrentVersion("intl");
  const jpVersion = getCurrentVersion("jp");

  // Load tokens from localStorage on mount
  useEffect(() => {
    const savedAdminToken = localStorage.getItem("adminToken");
    const savedMaimaiToken = localStorage.getItem("maimaiToken");
    if (savedAdminToken) {
      setAdminToken(savedAdminToken);
    }
    if (savedMaimaiToken) {
      setMaimaiToken(savedMaimaiToken);
    }
  }, []);

  // Save admin token to localStorage whenever it changes
  useEffect(() => {
    if (adminToken) {
      localStorage.setItem("adminToken", adminToken);
    }
  }, [adminToken]);

  // Save maimai token to localStorage whenever it changes
  useEffect(() => {
    if (maimaiToken) {
      localStorage.setItem("maimaiToken", maimaiToken);
    }
  }, [maimaiToken]);

  const appendConsoleLog = useCallback((log: string) => {
    setConsoleLog(old => old + log + "\n");
  }, [setConsoleLog]);

  function handleNormalizeDatabase(region: "intl" | "jp") {
    appendConsoleLog("Normalizing database for region " + region + "...");
    fetch(`/api/admin/db?type=normalize&region=${region}`, {
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

  function handleUpdateB50Database(region: "intl" | "jp") {
    appendConsoleLog("Updating B50 database for region " + region + "...");
    fetch(`/api/admin/db?type=update_b50&region=${region}`, {
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

  function handleFetchFallbackSongs(region: "intl" | "jp") {
    appendConsoleLog("Fetching fallback songs for region " + region + "...");
    const maimaiTokenEncoded = encodeURIComponent(maimaiToken);
    fetch(`/api/admin/update?region=${region}&token=${maimaiTokenEncoded}`, {
      method: "GET",
      headers: { "Authorization": "Bearer " + adminToken }
    }).then(async data => {
      appendConsoleLog(`Response ${data.status} ${data.statusText}:`);
      const text = await data.text();
      try {
        const json = JSON.parse(text);
        if (json.success) {
          appendConsoleLog("Fallback songs fetched successfully");
          setFallbackSongs(json.records);
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

  function handleUpdateDatabase(region: "intl" | "jp") {
    appendConsoleLog("Updating database for region " + region + "...");
    fetch(`/api/admin/update_db?region=${region}`, {
      method: "POST",
      headers: { "Authorization": "Bearer " + adminToken },
      body: JSON.stringify({ fallbackRecords: fallbackSongs }),
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

  function handleFetchNewSongs(region: "intl" | "jp") {
    appendConsoleLog("Fetching new songs for region " + region + "...");
    const maimaiTokenEncoded = encodeURIComponent(maimaiToken);
    fetch(`/api/admin/update_new?region=${region}&token=${maimaiTokenEncoded}`, {
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

  function handlePreviewChanges(region: "intl" | "jp") {
    if (newSongs.length === 0) {
      appendConsoleLog("Error: No new songs loaded. Please fetch songs first.");
      return;
    }

    const version = region === "intl" ? intlVersion : jpVersion;
    appendConsoleLog(`Previewing changes for ${region} v${version} (${newSongs.length} songs)...`);

    fetch(`/api/admin/upload?region=${region}&version=${version}`, {
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
              appendConsoleLog(`  - ${song.songKey} | ${song.level} | ${song.artist} (dbId: ${song.dbId})${playCount}`);
            });
          }

          if (json.changes.added.length > 0) {
            appendConsoleLog(`\nAdded songs (${json.changes.added.length}):`);
            json.changes.added.forEach((song: any) => {
              appendConsoleLog(`  + ${song.songKey} | ${song.level} | ${song.artist}`);
            });
          }

          if (json.changes.modified.length > 0) {
            // Group changes by field type
            const changesByField: Record<string, Array<{ songKey: string; oldValue: any; newValue: any; levelPreciseOld?: any; levelPreciseNew?: any }>> = {};

            json.changes.modified.forEach((song: any) => {
              const levelChange = song.fieldChanges.find((c: any) => c.field === "level");
              const levelPreciseChange = song.fieldChanges.find((c: any) => c.field === "levelPrecise");

              // Handle level and levelPrecise together
              if (levelChange || levelPreciseChange) {
                if (!changesByField["level"]) changesByField["level"] = [];
                changesByField["level"].push({
                  songKey: song.songKey,
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
                    songKey: song.songKey,
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
                let msg = `  ${change.songKey}`;
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
                appendConsoleLog(`  ${change.songKey} | ${oldVal} → ${newVal}`);
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

  function handleCacheImages() {
    appendConsoleLog("Caching images...");
    fetch(`/api/admin/cache_images`, {
      method: "GET",
      headers: { "Authorization": "Bearer " + adminToken },
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

  const handleAdminDialogChange = (newOpen: boolean) => {
    if (usersBrowserOpen) return;
    onOpenChange(newOpen);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleAdminDialogChange}>
        <DialogContent className={cn("max-w-2xl max-h-[80vh] overflow-y-auto transition-[opacity,scale] duration-200", usersBrowserOpen ? "opacity-70 scale-95" : "")}>
          <DialogHeader>
            <DialogTitle>ともマイ Admin Panel</DialogTitle>
            <DialogDescription>
              Modifying the database and other admin-only features.
            </DialogDescription>
          </DialogHeader>

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
              <Label>Normalize Database</Label>
              <div className="grid gap-2 grid-cols-2">
                <Button
                  id="normalizeIntlDatabase"
                  variant="outline"
                  onClick={() => handleNormalizeDatabase("intl")}
                >
                  International (v{intlVersion})
                </Button>
                <Button
                  id="normalizeJpDatabase"
                  variant="outline"
                  onClick={() => handleNormalizeDatabase("jp")}
                >
                  Japan (v{jpVersion})
                </Button>
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Update B50 Database</Label>
              <div className="grid gap-2 grid-cols-2">
                <Button
                  id="updateB50IntlDatabase"
                  variant="outline"
                  onClick={() => handleUpdateB50Database("intl")}
                >
                  International
                </Button>
                <Button
                  id="updateB50JpDatabase"
                  variant="outline"
                  onClick={() => handleUpdateB50Database("jp")}
                >
                  Japan
                </Button>
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="maimaiToken">Maimai Token</Label>
              <span className="text-sm text-muted-foreground">
                This is the token you use to fetch data from the maimai website.
                <br />
                This can be account://&lt;username&gt;:://&lt;password&gt; or cookie://&lt;token&gt;
              </span>
              <Input
                id="maimaiToken"
                value={maimaiToken}
                onChange={(e) => setMaimaiToken(e.target.value)}
              />
            </div>

            <div className="grid gap-2">
              <Label>Fetch Fallback Songs from Official Sites</Label>
              <span className="text-sm text-muted-foreground">
                This will fetch the fallback songs from the official sites and add them to the database.
                <br />
                Current fallback songs: {fallbackSongs.length}
              </span>
              <div className="grid gap-2 grid-cols-2">
                <Button
                  id="fetchIntlFallbackSongs"
                  variant="outline"
                  onClick={() => handleFetchFallbackSongs("intl")}
                >
                  International (v{intlVersion})
                </Button>
                <Button
                  id="fetchJpFallbackSongs"
                  variant="outline"
                  onClick={() => handleFetchFallbackSongs("jp")}
                >
                  Japan (v{jpVersion})
                </Button>
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Fetch New Songs from Pipeline</Label>
              <span className="text-sm text-muted-foreground">
                This will fetch songs using the full pipeline (scraper, dxdata, etc.).
                <br />
                Current new songs: {newSongs.length}
              </span>
              <div className="grid gap-2 grid-cols-2">
                <Button
                  id="fetchIntlNewSongs"
                  variant="outline"
                  onClick={() => handleFetchNewSongs("intl")}
                >
                  Fetch International (v{intlVersion})
                </Button>
                <Button
                  id="fetchJpNewSongs"
                  variant="outline"
                  onClick={() => handleFetchNewSongs("jp")}
                >
                  Fetch Japan (v{jpVersion})
                </Button>
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Preview Changes</Label>
              <span className="text-sm text-muted-foreground">
                Preview what changes would be made to the database without actually updating it.
              </span>
              <div className="grid gap-2 grid-cols-2">
                <Button
                  id="previewIntlChanges"
                  variant="outline"
                  onClick={() => handlePreviewChanges("intl")}
                  disabled={newSongs.length === 0}
                >
                  Preview International (v{intlVersion})
                </Button>
                <Button
                  id="previewJpChanges"
                  variant="outline"
                  onClick={() => handlePreviewChanges("jp")}
                  disabled={newSongs.length === 0}
                >
                  Preview Japan (v{jpVersion})
                </Button>
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Update Database in addition with fallback songs</Label>
              <div className="grid gap-2 grid-cols-2">
                <Button
                  id="updateIntlDatabase"
                  variant="outline"
                  onClick={() => handleUpdateDatabase("intl")}
                >
                  International (v{intlVersion})
                </Button>
                <Button
                  id="updateJpDatabase"
                  variant="outline"
                  onClick={() => handleUpdateDatabase("jp")}
                >
                  Japan (v{jpVersion})
                </Button>
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Cache Images</Label>
              <Button
                id="cacheImages"
                variant="outline"
                onClick={() => handleCacheImages()}
              >
                Cache Images
              </Button>
            </div>

            <div className="p-2 bg-gray-200/70 rounded-md text-sm font-mono text-muted-foreground break-all h-[200px] w-full whitespace-pre overflow-y-auto">
              {consoleLog}
            </div>

            <div className="pt-4 border-t">
              <p className="text-center text-sm text-muted-foreground">
                Built with ❤️ for the maimai community
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <UsersBrowserDialog
        open={usersBrowserOpen}
        onOpenChange={setUsersBrowserOpen}
        adminToken={adminToken}
      />
    </>
  );
}
