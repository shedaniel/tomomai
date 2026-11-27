"use client";

import type { CSSProperties, ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { NET_DIFFICULTY_COLORS } from "./difficulty";
import { NetStarArt } from "./net-art";
import { NetDifficultyLabel, NetLevel, NetRank, NetStatus } from "./kit";
import { netScoreView, type NetChartScore } from "./score";
import styles from "./cards.module.css";

/**
 * The compact song row from DX NET's song score and rating lists. Unplayed charts show only the title bar.
 * `extra` sits at the right of the score line, such as a rating value. With `href` the title opens the song page.
 */
export function NetMusicRow({ score, extra, showStatus = true, href }: {
  score: NetChartScore; extra?: ReactNode; showStatus?: boolean; href?: string;
}) {
  const t = useTranslations("net.common");
  const view = netScoreView(score);
  const colors = NET_DIFFICULTY_COLORS[view.difficulty];
  return (
    <article className={styles.row} style={{ "--fill": colors.fill, "--strip": colors.strip } as CSSProperties}>
      <span className={cn(styles.tag, view.chartType === "dx" ? styles.tagDx : styles.tagStd)}>{t(`chartTypes.${view.chartType}`)}</span>
      <div className={styles.rowHead}>
        <NetDifficultyLabel difficulty={view.difficulty}>{t(`difficulties.${view.difficulty}`)}</NetDifficultyLabel>
        <i aria-hidden className={styles.rowStars}><NetStarArt size={12} filled={false} /><NetStarArt size={12} filled={false} /><NetStarArt size={12} filled={false} /></i>
      </div>
      <div className={styles.rowMain}>
        {href
          ? <Link href={href} className={cn(styles.rowTitle, styles.rowLink)}>{score.songName}</Link>
          : <div className={styles.rowTitle}>{score.songName}</div>}
        <NetLevel label={t("level")} level={score.level} />
      </div>
      {view.achievement && (
        <div className={styles.rowScore}>
          <span className={styles.pct}>{view.achievement}</span>
          {view.dxScore != null
            ? <span className={styles.dx}><em>{t("dxScore")}</em>{view.dxScore.toLocaleString()}</span>
            : <span style={{ flex: 1 }} />}
          {extra && <span className={styles.extra}>{extra}</span>}
          {view.grade && <NetRank grade={view.grade} className={styles.rank2} />}
          {showStatus && <><NetStatus status={view.combo} /><NetStatus status={view.sync} /></>}
        </div>
      )}
    </article>
  );
}
