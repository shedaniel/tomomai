"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCallback, useEffect, useState } from "react";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Button } from "../ui/button";
import { getCurrentVersion } from "@/lib/metadata";

interface AdminDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AdminDialog({ open, onOpenChange }: AdminDialogProps) {
  const [adminToken, setAdminToken] = useState("");
  const [maimaiToken, setMaimaiToken] = useState("");
  const [fallbackSongs, setFallbackSongs] = useState<object[]>([]);
  const [consoleLog, setConsoleLog] = useState("Welcome to the admin panel!\n");

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
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
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
  );
} 