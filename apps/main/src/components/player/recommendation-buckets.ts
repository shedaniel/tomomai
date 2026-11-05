"use client";

import { useTranslations } from "next-intl";
import { useGame } from "@/components/providers/game-provider";
import { getGameRankingBuckets } from "@/lib/games/presentation";

/** The served game's best-score buckets as short labels, keyed `new` and `old` for the recommendations copy. */
export function useBestBucketLabels(): Record<string, string> {
  const t = useTranslations("dataContent.rankingBucket");
  const game = useGame().id;
  return Object.fromEntries(getGameRankingBuckets(game).map(bucket => [bucket.key, t("short", { size: bucket.size })]));
}
