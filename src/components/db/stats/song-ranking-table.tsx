"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { CoverImage } from "@/components/cover-image";

interface SongRankingTableProps {
  data: {
    songName: string;
    type: "std" | "dx";
    difficulty: string;
    cover: string;
    artist: string;
    percentage: number;
    averageAchievement: number;
  }[];
}

export function SongRankingTable({ data }: SongRankingTableProps) {
  const t = useTranslations("db.stats");

  return (
    <div className="rounded-md border">
      <div className="divide-y divide-border divide-dashed">
        {/* Header */}
        <div className="grid grid-cols-[auto_1fr_auto] gap-4 p-3 font-medium text-sm text-muted-foreground bg-muted/50">
          <div className="w-8 text-center">{t("table.rank")}</div>
          <div>{t("table.song")}</div>
          <div className="text-right">{t("table.percentage")}</div>
        </div>

        {/* Rows */}
        {data.map((item, index) => (
          <div
            key={`${item.songName}-${item.type}-${item.difficulty}`}
            className="grid grid-cols-[auto_1fr_auto] gap-4 p-3 items-center hover:bg-muted/20 transition-colors"
          >
            <div className="w-8 text-center font-mono text-sm text-muted-foreground">
              #{index + 1}
            </div>

            <div className="flex items-center gap-3 min-w-0">
              <div className="relative w-10 h-10 rounded overflow-hidden flex-shrink-0 border bg-muted">
                <CoverImage
                  coverUrl={item.cover}
                  alt={item.songName}
                  fill
                  className="object-cover"
                  loading="lazy"
                />
              </div>
              <div className="flex flex-col min-w-0">
                <div className="font-medium truncate">{item.songName}</div>
                <div className="text-xs text-muted-foreground truncate flex items-center gap-1">
                  <span className={cn(
                    "uppercase text-[10px] font-bold px-1 rounded",
                    item.type === "dx" ? "bg-blue-100 text-blue-700" : "bg-orange-100 text-orange-700"
                  )}>
                    {item.type}
                  </span>
                  <span className={cn(
                    "uppercase text-[10px] font-bold px-1 rounded text-white",
                    item.difficulty === "basic" && "bg-green-500",
                    item.difficulty === "advanced" && "bg-yellow-500",
                    item.difficulty === "expert" && "bg-red-500",
                    item.difficulty === "master" && "bg-purple-500",
                    item.difficulty === "remaster" && "bg-purple-200 text-purple-900",
                    item.difficulty === "utage" && "bg-pink-500"
                  )}>
                    {item.difficulty.substring(0, 3)}
                  </span>
                  <span>{item.artist}</span>
                </div>
              </div>
            </div>

            <div className="text-right font-mono text-sm">
              <div>{(item.percentage * 100).toFixed(2)}%</div>
              <div className="text-xs text-muted-foreground">
                Avg: {(item.averageAchievement / 10000).toFixed(4)}%
              </div>
            </div>
          </div>
        ))}

        {data.length === 0 && (
          <div className="p-8 text-center text-muted-foreground">
            {t("noDataAvailable")}
          </div>
        )}
      </div>
    </div>
  );
}
