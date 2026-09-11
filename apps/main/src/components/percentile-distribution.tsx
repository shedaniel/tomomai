"use client";

import { useId, useState } from "react";
import { Separator, Tabs, TabsList, TabsTrigger, TabsContent } from "@tomomai/ui";
import { useFormatter, useTranslations } from "next-intl";
import { Popover } from "radix-ui";
import type { PercentileDistributionData } from "@/lib/percentile-types";
import { achievementRange, ratingClusterPosition, cumulativePoints, shareAtOrBelow, peerRank } from "@/lib/percentile-chart";

const PLOT = { left: 38, right: 308, top: 14, bottom: 151 };
const GRADE_STOPS = [970000, 980000, 990000, 1000000, 1005000, 1010000];

export function PercentileDistribution({ data, withSeparator = true }: {
  data: PercentileDistributionData;
  withSeparator?: boolean;
}) {
  const t = useTranslations('scoreComparison');
  const format = useFormatter();
  const scoreLabel = (score: number, digits = 1) => format.number(score / 1000000, {
    style: 'percent', minimumFractionDigits: digits === 4 ? 4 : 0, maximumFractionDigits: digits,
  });
  const percentLabel = (share: number) => format.number(share, { style: 'percent', maximumFractionDigits: 0 });
  const achievement = scoreLabel(data.userAchievement, 4);
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
  const rank = peerRank(data.percentile ?? 0, cumulativeShare);
  const rankPercent = rank.share < 0.01 ? t('lessThan', { percent: percentLabel(0.01) }) : percentLabel(rank.share);
  const rankLabel = rank.kind === 'median' ? t('median') : t(rank.kind, { percent: rankPercent });
  const description = isRating
    ? t('ratingDescription', { count: format.number(data.totalPlayerCount), rating: format.number(data.userRating), achievement })
    : t('curveDescription', { percent: percentLabel(cumulativeShare), achievement });

  return (
    <>
      {withSeparator && <Separator />}
      <Tabs value={view} activationMode="manual" onValueChange={(value) => {
        if (value === 'curve' && !curveAvailable) return;
        setSelectedView(value as 'rating' | 'curve');
        setErrorOpen(false);
      }} className="space-y-2" aria-label={t('title')}>
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="font-medium">{t('title')}</span>
          <span className="text-primary font-semibold tabular-nums">{t('you', { achievement })}</span>
        </div>
        <TabsList className="flex h-auto w-full rounded-full p-0.5" aria-label={t('view')}>
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
                {t('curveTab')}
              </TabsTrigger>
            </Popover.Anchor>
            <Popover.Portal>
              <Popover.Content side="bottom" align="start" sideOffset={6}
                onOpenAutoFocus={(event) => event.preventDefault()}
                onCloseAutoFocus={(event) => event.preventDefault()}
                className="z-50 max-w-60 rounded-md border bg-popover p-3 text-xs text-popover-foreground shadow-md">
                {t('unavailable')}
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
          <TabsTrigger value="rating" className="flex-1 rounded-full text-[11px]">{t('ratingTab')}</TabsTrigger>
        </TabsList>
        <TabsContent value={view} className="space-y-2">
          <p className="text-[10px] text-muted-foreground">{t(isRating ? 'ratingHeading' : 'curveHeading')}</p>
          <svg viewBox="0 0 320 200" className="block w-full overflow-visible" role="img" aria-labelledby={titleId}>
            <title id={titleId}>{description}</title>
            {yTicks.map(tick => (
              <g key={tick}>
                {isRating && <line x1={PLOT.left} x2={PLOT.right} y1={y(tick)} y2={y(tick)} stroke="var(--border)" strokeDasharray="2 4" />}
                <text x={PLOT.left - 7} y={y(tick) + 3} textAnchor="end" fontSize="10" fill="var(--muted-foreground)">{isRating ? scoreLabel(tick) : percentLabel(tick / 100)}</text>
              </g>
            ))}
            {!isRating && gradeStops.map(tick => <line key={tick} x1={x(tick)} x2={x(tick)} y1={PLOT.top} y2={PLOT.bottom} stroke="var(--border)" strokeDasharray="2 4" />)}
            {xTicks.map(tick => <text key={tick} x={x(tick)} y={PLOT.bottom + (!isRating && tick === 1005000 ? 29 : 16)} textAnchor="middle" fontSize="10" fill="var(--muted-foreground)">{isRating ? format.number(tick, { notation: 'compact', maximumFractionDigits: 2 }) : scoreLabel(tick)}</text>)}
            <text x={(PLOT.left + PLOT.right) / 2} y="198" textAnchor="middle" fontSize="10" fill="var(--muted-foreground)">{t(isRating ? 'ratingAxis' : 'achievementAxis')}</text>
            {isRating ? data.ratingDistribution.filter(point => point.achievementLo >= min).map(point => {
              const position = ratingClusterPosition(point);
              return <circle key={`${point.ratingLo}:${point.achievementLo}`} cx={x(position.rating)} cy={y(position.achievement)}
                r={Math.min(4, 1.4 + Math.sqrt(point.count) * 0.5)} fill="var(--muted-foreground)" opacity={0.35 + Math.min(0.4, point.count / 30)}>
                <title>{t('clusterDescription', {
                  ratingMin: format.number(point.ratingLo), ratingMax: format.number(point.ratingLo + 124),
                  achievementMin: scoreLabel(point.achievementLo), achievementMax: scoreLabel(Math.min(1010000, point.achievementLo + 1000)),
                  count: point.count,
                })}</title>
              </circle>
            }) : <path d={curve} fill="none" stroke="var(--muted-foreground)" strokeWidth="1.8" strokeLinejoin="round" />}
            <line x1={PLOT.left} x2={userX} y1={userY} y2={userY} stroke="var(--primary)" strokeDasharray="3 3" opacity="0.65" />
            <line x1={userX} x2={userX} y1={userY} y2={PLOT.bottom} stroke="var(--primary)" strokeDasharray="3 3" opacity="0.65" />
            {!isRating && data.percentile != null && (
              <text x={PLOT.left + 5} y={userY - 7} fontSize="11" fontWeight="600" fill="var(--primary)"
                stroke="var(--background)" strokeWidth="3" paintOrder="stroke" strokeLinejoin="round">
                {rankLabel}
              </text>
            )}
            <path d={`M${userX},${userY - 5} l5,5 l-5,5 l-5,-5 Z`} fill="var(--primary)" stroke="var(--background)" strokeWidth="1.5">
              <title>{t('youDescription', { rating: format.number(data.userRating), achievement })}</title>
            </path>
          </svg>
        </TabsContent>
      </Tabs>
    </>
  );
}
