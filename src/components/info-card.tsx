"use client";

import { Card, CardContent } from "@/components/ui/card";
import { getRatingImageUrl } from "@/lib/rating-calculator";
import { SnapshotWithSongs } from "@/lib/types";
import { createSafeMaimaiImageUrl } from "@/lib/utils";
import { useTranslations } from "next-intl";
import Image from "next/image";
import Link from "next/link";
import { motion } from "motion/react";
import { SPRING_CONFIGS, STAGGER, getTransition } from "@/lib/animation-constants";

function RatingImage({ rating }: { rating: number }) {
  return (
    <Image src={getRatingImageUrl(rating)} alt={rating.toString()} width={120} height={35} crossOrigin="anonymous" />
  );
}

export function InfoCard({
  selectedSnapshotData,
  showPlayCounts = true,
  visitableProfileAt,
}: {
  selectedSnapshotData: SnapshotWithSongs;
  showPlayCounts?: boolean;
  visitableProfileAt: string | null;
}) {
  const t = useTranslations();

  const { snapshot } = selectedSnapshotData;

  return (
    <Card>
      <CardContent>
        {/* Profile Visibility Banner */}
        <div className="mb-6 p-4 rounded-md bg-muted ring-2 ring-offset-2 ring-offset-card ring-foreground/20">
          {visitableProfileAt ? (
            <div>
              <h3 className="font-medium mb-1 text-foreground">{t('profileVisibility.public')}</h3>
              <p className="text-sm text-muted-foreground">
                {t('profileVisibility.accessibleBy')}
                <Link
                  href={`/profile/${visitableProfileAt}`}
                  className="text-foreground hover:text-foreground/80 underline"
                >
                  https://tomomai.lol/profile/{visitableProfileAt}
                </Link>
                {t('profileVisibility.accessibleByEnd')} {t('profileVisibility.youMayChangePrivacySettings')}
              </p>
            </div>
          ) : (
            <div>
              <h3 className="font-medium mb-1 text-primary">{t('profileVisibility.private')}</h3>
              <p className="text-sm text-muted-foreground">
                {t('profileVisibility.onlyAccessibleByYou')}
              </p>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 mb-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.8, rotate: -5 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            transition={getTransition(SPRING_CONFIGS.default)}
          >
            <Image src={createSafeMaimaiImageUrl(snapshot.iconUrl)} alt={snapshot.title} width={80} height={80} />
          </motion.div>
          <div className="flex flex-col min-w-0 self-stretch my-1 space-y-0.5 items-stretch">
            <span className="text-sm text-secondary-foreground bg-secondary rounded-full px-6 py-1 text-center inset-shadow-sm truncate">{snapshot.title}</span>
            <span className="text-lg font-medium flex items-center self-center max-xs:flex-col">
              <span className="mx-4 flex-1 whitespace-nowrap max-xs:text-md max-2xs:text-sm">{snapshot.displayName}</span>
              <div className="shrink-0 grow-0 min-w-fit w-[120px] h-[35px] relative">
                <RatingImage rating={snapshot.rating} />
                <span className="absolute top-[3px] left-[8px] w-[106px] h-[21px] tracking-[1.65px] text-right text-[18px] text-white box-border font-normal font-mono">{snapshot.rating}</span>
              </div>
            </span>
          </div>
        </div>
        <div className="bg-muted/50 rounded-md p-4">
          <h4 className="font-medium mb-2">{t('dataContent.playerInfo')}</h4>
          <div className={`grid gap-2 text-sm ${showPlayCounts ? 'grid-cols-2' : 'grid-cols-1'}`}>
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={getTransition({ delay: STAGGER.slow * 0 })}
            >
              {t('dataContent.rating', { rating: snapshot.rating })}
            </motion.div>
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={getTransition({ delay: STAGGER.slow * 1 })}
            >
              {t('dataContent.stars', { stars: snapshot.stars })}
            </motion.div>
            {showPlayCounts && (
              <>
                <motion.div
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={getTransition({ delay: STAGGER.slow * 2 })}
                >
                  {t('dataContent.versionPlays', { count: snapshot.versionPlayCount })}
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={getTransition({ delay: STAGGER.slow * 3 })}
                >
                  {t('dataContent.totalPlays', { count: snapshot.totalPlayCount })}
                </motion.div>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
