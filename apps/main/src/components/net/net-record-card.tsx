"use client";

import type { CSSProperties, ReactNode } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { NET_DIFFICULTY_COLORS } from "./difficulty";
import { NetLevel, NetRank, NetStatus } from "./kit";
import { netScoreView, splitAchievement, type NetChartScore } from "./score";
import { NetImage } from "./net-image";
import styles from "./cards.module.css";

/** The big Game Record card: difficulty word, TRACK pill, jacket, achievement and DX score. */
export function NetRecordCard({
  score,
  track,
  playedAt,
  newRecord = false,
  maxDxScore,
  action,
}: {
  score: NetChartScore;
  track?: ReactNode;
  playedAt?: ReactNode;
  newRecord?: boolean;
  maxDxScore?: number | null;
  action?: ReactNode;
}) {
  const t = useTranslations("net.common");
  const view = netScoreView(score);
  const colors = NET_DIFFICULTY_COLORS[view.difficulty];
  const [whole, decimals] = splitAchievement(view.achievement ?? "0.0000%");
  return (
    <article className={styles.record} style={{ "--fill": colors.fill, "--strip": colors.strip, "--ink": colors.ink } as CSSProperties}>
      <div className={styles.recordDiff}>{t(`difficulties.${view.difficulty}`)}</div>
      {(track || playedAt) && <div className={styles.track}>{track && <b>{track}</b>}{playedAt}</div>}
      <div className={styles.recordCard}>
        <div className={styles.recordTop}>
          <div className={styles.recordTitle}>{score.songName}</div>
          <NetLevel label={t("level")} level={score.level} />
        </div>
        <div className={styles.recordBody}>
          <div className={styles.jacket}>
            {score.cover && <NetImage src={score.cover} />}
            <span className={cn(styles.jacketTag, view.chartType === "dx" ? styles.tagDx : styles.tagStd)}>{t(`chartTypes.${view.chartType}`)}</span>
          </div>
          <div className={styles.recordRight}>
            <div className={styles.achLabel}>{t("achievement")}</div>
            <div className={styles.achRow}>
              <div>
                {newRecord && <span className={styles.newRecord}>{t("newRecord")}</span>}
                <div className={styles.achValue}>{whole}<small>{decimals}</small></div>
              </div>
              {view.grade && <NetRank grade={view.grade} size={30} className={styles.bigRank} />}
            </div>
            <div className={styles.dots} />
            <div className={styles.dxBox}>
              <div className={styles.dxBar}>
                <b>{t("dxScore")}</b>
                {view.dxScore != null ? view.dxScore.toLocaleString() : "—"}
                {maxDxScore ? ` / ${maxDxScore.toLocaleString()}` : ""}
              </div>
              <div className={styles.medals}><NetStatus status={view.combo} /><NetStatus status={view.sync} /></div>
            </div>
            {action && <div className={styles.details}>{action}</div>}
          </div>
        </div>
      </div>
    </article>
  );
}
