"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc-client";
import { SnapshotWithSongs } from "@/lib/types";
import { ChevronDown, ChevronRight, Code, Download } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

interface DeveloperCardProps {
  selectedSnapshotData: SnapshotWithSongs;
}

const JSON_SCHEMA_DOCS = `{
  "metadata": {
    "id": string, // Unique snapshot identifier
    "displayName": string, // Player's display name
    "trophy": string, // Player's trophy
    "region": string, // Region code (e.g., 'intl', 'jp', 'cn')
    "fetchedAt": string, // ISO 8601 timestamp of when data was fetched
    "gameVersion": string, // Game version name (e.g., 'maimai DX BUDDiES PLUS')
    "rating": number, // Player's rating
    "stars": number, // Player's star count
    "courseRankUrl": string | null, // URL to course rank image
    "classRankUrl": string | null, // URL to class rank image
    "totalPlayCount": number, // Total number of plays
    "currentVersionPlayCount": number, // Number of plays in current version
  },
  "songs": {
    "songName": string, // Name of the song
    "artist": string, // Artist name
    "cover": string, // URL to cover image
    "difficulty": string, // Difficulty level (basic, advanced, expert, master, remaster, utage)
    "level": string, // Level display (e.g., '13+')
    "levelPrecise": number, // Precise level value (scaled as 10x number, e.g., 135 means 13.5)
    "type": string, // Chart type ('std' or 'dx')
    "gameVersion": string, // Game version short name (e.g., 'BUDDiES PLUS')
    "achievement": number, // Achievement (scaled as 10000x number, ranges from 0 to 1010000)
    "dxScore": number, // DX score
    "fc": string, // Full combo status ('none', 'fc', 'fc+', 'ap', 'ap+')
    "fs": string, // Full sync status ('none', 'sync', 'fs', 'fs+', 'fdx', 'fdx+'),
    "rating": number, // Rating calculated
  }[],
  "iconUrl": string | null, // URL to player's icon image, usually provided as Base64 encoded string
}`;

export function DeveloperCard({ selectedSnapshotData }: DeveloperCardProps) {
  const t = useTranslations();
  const [isExporting, setIsExporting] = useState(false);
  const [isSchemaExpanded, setIsSchemaExpanded] = useState(false);

  const { refetch } = trpc.user.exportSnapshotData.useQuery(
    { snapshotId: selectedSnapshotData.snapshot.id },
    { enabled: false }
  );

  const handleExportJson = async () => {
    try {
      setIsExporting(true);
      const result = await refetch();

      if (result.data) {
        const blob = new Blob([JSON.stringify(result.data, null, 2)], {
          type: "application/json",
        });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `snapshot-${selectedSnapshotData.snapshot.id}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error("Failed to export snapshot data:", error);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Card className="w-full mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Code className="h-5 w-5" />
          {t("dataContent.tabs.developer")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-col items-start space-y-4">
          <Button
            onClick={handleExportJson}
            disabled={isExporting}
            className="flex items-center gap-2"
          >
            {isExporting ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {isExporting
              ? t("dataContent.developer.exporting")
              : t("dataContent.developer.exportJson")}
          </Button>
        </div>

        <div className="border rounded-lg">
          <button
            onClick={() => setIsSchemaExpanded(!isSchemaExpanded)}
            className="flex items-center gap-2 w-full p-3 text-left text-sm font-medium hover:bg-muted/50 transition-colors"
          >
            {isSchemaExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
            JSON Schema Documentation
          </button>
          {isSchemaExpanded && (
            <div className="border-t p-4">
              <p className="text-sm mb-4">
                The JSON Schema documentation provides a detailed description of the structure and constraints of the JSON data used in the application. It serves as a reference for developers to understand the expected format.
                <br />This does not serve as the definitive source of truth for the JSON data format. The format may change in the future without notice.
              </p>
              <pre className="text-xs bg-muted p-4 rounded-md overflow-x-auto">
                <code>{JSON_SCHEMA_DOCS}</code>
              </pre>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
