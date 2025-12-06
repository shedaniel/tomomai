import { Tabs, TabsList, TabsPanel, TabsPanels, TabsTab } from "@/components/animate-ui/components/base/tabs";
import { DialogTitle } from "@/components/ui/dialog";
import { ACHIEVEMENTS, DIFFICULTY_COLORS } from "@/lib/difficulty";
import { calculateSongRating } from "@/lib/rating-calculator";
import { Region, SongExtended } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Fragment, useState } from "react";
import { UserScore } from "./types";

import { useTranslations } from "next-intl";

type SongExtendedIdentified = SongExtended & { region: Region; gameVersion: number };

function SongChartDialogGrid({ chart, score }: { chart: SongExtendedIdentified; score: UserScore }) {
    const t = useTranslations();
  
    return (
      <div className="grid grid-cols-[minmax(100px,5fr)_minmax(100px,1fr)] rounded-md overflow-hidden border">
        <div className="contents text-xs bg-accent/50 font-medium text-muted-foreground">
          <div className="py-2 px-3 border-b border-r">{t('db.songs.detail.achievement')}</div>
          <div className="py-2 px-3 border-b">{t('db.songs.detail.rating')}</div>
        </div>
        {chart.gameVersion >= 12 && (<>
          <div className="contents">
            <span className="py-2 px-3 text-xs border-r border-b">
              AP
            </span>
            <span className="py-2 px-3 text-xs border-b font-medium">{Math.floor(calculateSongRating({
              achievement: 1005000,
              fc: "ap",
              fs: "none",
              levelPrecise: chart.levelPrecise,
              addedVersion: chart.addedVersion
            }, chart.gameVersion))}</span>
          </div>
        </>)}
        {ACHIEVEMENTS.map((achievement, index) => (<Fragment key={index}>
          {score && score.achievement > achievement.achievement && (index === 0 || ACHIEVEMENTS[index - 1].achievement >= score.achievement) && (<Fragment key={`score-${score.achievement}`}>
            <div className="contents *:bg-primary/80 text-primary-foreground">
              <span className="py-2 px-3 text-xs border-r border-b font-semibold flex gap-1.5 flex-wrap">
                <span className="whitespace-nowrap">{t('db.songs.detail.yourScore')}</span>
                <span className="text-xs whitespace-nowrap">({(score.achievement / 10000).toFixed(4)}%)</span>
              </span>
              <span className="py-2 px-3 text-xs border-b font-medium">{Math.floor(calculateSongRating({
                achievement: score.achievement,
                fc: "none",
                fs: "none",
                levelPrecise: chart.levelPrecise,
                addedVersion: chart.addedVersion
              }, chart.gameVersion))}</span>
            </div>
          </Fragment>)}
          <div key={achievement.achievement} className="contents">
            <span className="py-2 px-3 text-xs border-r border-b">
              {achievement.rate}
              <span className="ml-1.5 text-xs text-muted-foreground">({(achievement.achievement / 10000).toFixed(4)}%)</span>
            </span>
            <span className="py-2 px-3 text-xs border-b font-medium">{Math.floor(calculateSongRating({
              achievement: achievement.achievement,
              fc: "none",
              fs: "none",
              levelPrecise: chart.levelPrecise,
              addedVersion: chart.addedVersion
            }, chart.gameVersion))}</span>
          </div>
        </Fragment>
        ))}
      </div>
    )
  }
  
  export function SongChartDialogContent({ charts, scores }: { charts: SongExtendedIdentified[]; scores: Record<Region, UserScore> }) {
    const t = useTranslations();
    const regionsWithScores = Object.keys(scores).filter(region => scores[region as Region] !== undefined);
    const [region, setRegion] = useState<Region>((regionsWithScores[0] ?? charts[0].region) as Region);
  
    const chart = charts.find(c => c.region === region)!;
  
    return <>
      <DialogTitle>
        <span className={cn("font-bold mr-2", DIFFICULTY_COLORS[chart.difficulty]?.text ?? "text-gray-600")}>
          {t(`common.difficulties.${chart.difficulty}`)}
        </span>
        <span className="text-lg font-bold tabular-nums">{chart.level}</span>
        <span className="text-xs">.{chart.difficulty === "utage" ? '?' : chart.levelPrecise % 10}</span>
      </DialogTitle>
      <Tabs value={region} onValueChange={(value) => setRegion(value as Region)}>
        <TabsList className={cn("grid w-full grid-cols-2", charts.length <= 1 && "hidden")}>
          {charts.map(c => (
            <TabsTab key={c.region} value={c.region}>{t(`regions.${c.region}`)}</TabsTab>
          ))}
        </TabsList>
  
        <TabsPanels>
          {charts.map(c => (
            <TabsPanel key={c.region} value={c.region}>
              <SongChartDialogGrid chart={c} score={scores[c.region]} />
            </TabsPanel>
          ))}
        </TabsPanels>
      </Tabs>
    </>;
  }