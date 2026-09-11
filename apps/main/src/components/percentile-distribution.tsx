"use client";

import { useId, useState } from "react";
import { Separator, Tabs, TabsList, TabsTrigger, TabsContent } from "@tomomai/ui";
import { Popover } from "radix-ui";
import type { PercentileDistributionData } from "@/lib/percentile-types";
import { achievementRange, cumulativeLabel, ratingClusterPosition, cumulativePoints, shareAtOrBelow, peerRankLabel } from "@/lib/percentile-chart";

const PLOT = { left: 38, right: 308, top: 14, bottom: 151 };
const GRADE_STOPS = [970000, 980000, 990000, 1000000, 1005000, 1010000];
const scoreLabel = (score: number) => `${Number((score / 10000).toFixed(1))}%`;

export function PercentileDistribution({ data, withSeparator = true }: {
  data: PercentileDistributionData;
  withSeparator?: boolean;
}) {
  const curveAvailable = data.percentile != null && data.distribution.length > 0;
  const [selectedView, setSelectedView] = useState<'rating' | 'curve' | null>(null);
  const [errorOpen, setErrorOpen] = useState(false);
  const view = selectedView === 'rating' || !curveAvailable ? 'rating' : 'curve';
  const titleId = useId();
  const isRating = view === 'rating';
  const scores = isRating ? data.ratingDistribution.map(point => point.achievementLo) : data.distribution.map(point => point.lo);
  const { min, max } = achievementRange(scores, data.userAchievement, false);
  const ratingMin = Math.floor(Math.min(data.userRating, ...data.ratingDistribution.map(point => point.ratingLo)) / 1000) * 1000;
  const ratingMax = Math.max(ratingMin + 1000, Math.ceil(Math.max(data.userRating, ...data.ratingDistribution.map(point => point.ratingLo + 125)) / 1000) * 1000);
  const x = (value: number) => PLOT.left + (value - (isRating ? ratingMin : min)) / (isRating ? ratingMax - ratingMin : max - min) * (PLOT.right - PLOT.left);
  const y = (value: number) => PLOT.bottom - (value - (isRating ? min : 0)) / (isRating ? max - min : 100) * (PLOT.bottom - PLOT.top);
  const userX = x(isRating ? data.userRating : data.userAchievement);
  const cumulativeShare = shareAtOrBelow(data.distribution, data.userAchievement);
  const userY = y(isRating ? data.userAchievement : cumulativeShare * 100);
  const gradeStops = GRADE_STOPS.filter(score => score >= min && score <= max);
  const xTicks = !isRating && min >= 940000 ? [...(min < 970000 ? [min] : []), ...gradeStops] : Array.from({ length: 5 }, (_, i) => (isRating ? ratingMin : min) + i * (isRating ? ratingMax - ratingMin : max - min) / 4);
  const yTicks = Array.from({ length: 5 }, (_, i) => isRating ? min + i * (max - min) / 4 : i * 25);
  const curve = cumulativePoints(data.distribution, min, max).map((point, index) => `${index ? 'L' : 'M'}${x(point.score)},${y(point.percent)}`).join(' ');
  const peerLabel = data.percentile == null ? null : cumulativeLabel(cumulativeShare);
  const description = isRating
    ? `Achievement versus rating across ${data.totalPlayerCount} recorded international players in available rating bands. Dots group sampled scores into 125 rating points and 0.1% achievement, with approximate positions spread within each bin. Your rating is ${data.userRating}, achievement ${(data.userAchievement / 10000).toFixed(4)}%.`
    : `Estimated share of nearby-rated players scoring at or below each achievement. ${peerLabel ?? 'Unknown'} scored at or below your ${(data.userAchievement / 10000).toFixed(4)}%. Ties are included.`;

  return (
    <>
      {withSeparator && <Separator />}
      <Tabs value={view} activationMode="manual" onValueChange={(value) => {
        if (value === 'curve' && !curveAvailable) return;
        setSelectedView(value as 'rating' | 'curve');
        setErrorOpen(false);
      }} className="space-y-2" aria-label="Score comparison">
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="font-medium">Score comparison</span>
          <span className="text-primary font-semibold tabular-nums">You · {(data.userAchievement / 10000).toFixed(4)}%</span>
        </div>
        <TabsList className="flex h-auto w-full rounded-full p-0.5" aria-label="Comparison view">
          <Popover.Root open={errorOpen && !curveAvailable} onOpenChange={setErrorOpen}>
            <Popover.Anchor asChild>
              <TabsTrigger value="curve" className="flex-1 rounded-full text-[11px]" aria-disabled={!curveAvailable}
                onClick={() => { if (!curveAvailable) setErrorOpen(true); }}
                onKeyDown={(event) => {
                  if (!curveAvailable && (event.key === 'Enter' || event.key === ' ')) {
                    event.preventDefault();
                    setErrorOpen(true);
                  }
                }}>
                Score curve
              </TabsTrigger>
            </Popover.Anchor>
            <Popover.Portal>
              <Popover.Content side="bottom" align="start" sideOffset={6}
                onOpenAutoFocus={(event) => event.preventDefault()}
                onCloseAutoFocus={(event) => event.preventDefault()}
                className="z-50 max-w-60 rounded-md border bg-popover p-3 text-xs text-popover-foreground shadow-md">
                Not enough balanced nearby-rated players for a score curve.
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
          <TabsTrigger value="rating" className="flex-1 rounded-full text-[11px]">By rating</TabsTrigger>
        </TabsList>
        <TabsContent value={view} className="space-y-2">
          <p className="text-[10px] text-muted-foreground">{isRating ? 'Achievement by player rating' : 'Players scoring at or below this achievement'}</p>
          <svg viewBox="0 0 320 200" className="block w-full overflow-visible" role="img" aria-labelledby={titleId}>
            <title id={titleId}>{description}</title>
            {yTicks.map(tick => (
              <g key={tick}>
                {isRating && <line x1={PLOT.left} x2={PLOT.right} y1={y(tick)} y2={y(tick)} stroke="var(--border)" strokeDasharray="2 4" />}
                <text x={PLOT.left - 7} y={y(tick) + 3} textAnchor="end" fontSize="10" fill="var(--muted-foreground)">{isRating ? scoreLabel(tick) : `${tick}%`}</text>
              </g>
            ))}
            {!isRating && gradeStops.map(tick => <line key={tick} x1={x(tick)} x2={x(tick)} y1={PLOT.top} y2={PLOT.bottom} stroke="var(--border)" strokeDasharray="2 4" />)}
            {xTicks.map(tick => <text key={tick} x={x(tick)} y={PLOT.bottom + (!isRating && tick === 1005000 ? 29 : 16)} textAnchor="middle" fontSize="10" fill="var(--muted-foreground)">{isRating ? `${Number((tick / 1000).toFixed(2))}k` : scoreLabel(tick)}</text>)}
            <text x={(PLOT.left + PLOT.right) / 2} y="198" textAnchor="middle" fontSize="10" fill="var(--muted-foreground)">{isRating ? 'Player rating' : 'Achievement'}</text>
            {isRating ? data.ratingDistribution.filter(point => point.achievementLo >= min).map(point => {
              const position = ratingClusterPosition(point);
              return <circle key={`${point.ratingLo}:${point.achievementLo}`} cx={x(position.rating)} cy={y(position.achievement)}
                r={Math.min(4, 1.4 + Math.sqrt(point.count) * 0.5)} fill="var(--muted-foreground)" opacity={0.35 + Math.min(0.4, point.count / 30)}>
                <title>{`Rating ${point.ratingLo}–${point.ratingLo + 124}; ${(point.achievementLo / 10000).toFixed(1)}–${Math.min(101, (point.achievementLo + 1000) / 10000).toFixed(1)}%: ${point.count} sampled scores`}</title>
              </circle>
            }) : <path d={curve} fill="none" stroke="var(--muted-foreground)" strokeWidth="1.8" strokeLinejoin="round" />}
            <line x1={PLOT.left} x2={userX} y1={userY} y2={userY} stroke="var(--primary)" strokeDasharray="3 3" opacity="0.65" />
            <line x1={userX} x2={userX} y1={userY} y2={PLOT.bottom} stroke="var(--primary)" strokeDasharray="3 3" opacity="0.65" />
            {!isRating && data.percentile != null && (
              <text x={PLOT.left + 5} y={userY - 7} fontSize="11" fontWeight="600" fill="var(--primary)"
                stroke="var(--background)" strokeWidth="3" paintOrder="stroke" strokeLinejoin="round">
                {peerRankLabel(data.percentile, cumulativeShare)} among peers
              </text>
            )}
            <path d={`M${userX},${userY - 5} l5,5 l-5,5 l-5,-5 Z`} fill="var(--primary)" stroke="var(--background)" strokeWidth="1.5">
              <title>{`You: ${data.userRating} rating, ${(data.userAchievement / 10000).toFixed(4)}%`}</title>
            </path>
          </svg>
        </TabsContent>
      </Tabs>
    </>
  );
}
