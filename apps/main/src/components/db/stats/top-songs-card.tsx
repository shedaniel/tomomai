"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@tomomai/ui";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@tomomai/ui/select-friendly";
import { trpc } from "@/lib/trpc-client";
import { Region } from "@/lib/types";
import { SongRankingTable } from "./song-ranking-table";

type Window = "all" | "90d" | "30d" | "7d";

interface TopSongsCardProps {
  region: Region;
}

export function TopSongsCard({ region }: TopSongsCardProps) {
  const t = useTranslations("db.stats");
  const [window, setWindow] = useState<Window>("7d");

  const { data, isLoading } = trpc.db.getTopSongs.useQuery({ region, window });

  return (
    <Card className="break-inside-avoid">
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
        <CardTitle>{t("topSongs")}</CardTitle>
        <Select value={window} onValueChange={(v) => setWindow(v as Window)}>
          <SelectTrigger className="w-[130px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent label={t("topSongsWindow.label")} align="end">
            <SelectItem value="all">{t("topSongsWindow.all")}</SelectItem>
            <SelectItem value="90d">{t("topSongsWindow.90d")}</SelectItem>
            <SelectItem value="30d">{t("topSongsWindow.30d")}</SelectItem>
            <SelectItem value="7d">{t("topSongsWindow.7d")}</SelectItem>
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        {isLoading || !data ? (
          <div className="flex justify-center items-center h-32">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <SongRankingTable data={data} />
        )}
      </CardContent>
    </Card>
  );
}
