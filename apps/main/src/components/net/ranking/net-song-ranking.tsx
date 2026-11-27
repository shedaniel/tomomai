"use client";

import { useState, type CSSProperties } from "react";
import { useTranslations } from "next-intl";
import { NET_DIFFICULTY_COLORS, type NetDifficulty } from "../difficulty";
import { NetEmpty, NetSelect } from "../kit";
import { NetDifficultyPills } from "../net-difficulty-pills";
import { NetImage } from "../net-image";
import { NetPaywall } from "../net-paywall";
import { NET_RANKING_METRICS, type NetRankingBoards, type NetRankingEntry, type NetRankingMetric } from "./data";
import { NetRankMedal } from "./net-rating-plate";
import styles from "./ranking.module.css";

const FREE_ROWS = 3;

/** Equal values share a rank and the next one skips, like DX NET's 1, 1, 3. */
function ranks(entries: readonly NetRankingEntry[]): number[] {
  return entries.map(entry => entries.findIndex(other => other.value === entry.value) + 1);
}

export function NetSongRanking({ boards, playerName, updated }: { boards: NetRankingBoards; playerName: string; updated: string }) {
  const t = useTranslations("net.ranking.song");
  const common = useTranslations("net.common");
  const [metric, setMetric] = useState<NetRankingMetric>("level");
  const [difficulty, setDifficulty] = useState<NetDifficulty>("master");
  const entries = boards[metric][difficulty] ?? [];
  const places = ranks(entries);

  const format = (value: number) => (metric === "level" ? (value / 10).toFixed(1) : String(value));

  const rows = entries.map((entry, index) => (
    <div
      key={`${entry.name}-${entry.dx}-${index}`}
      className={styles.row}
      data-podium={places[index] <= 3 || undefined}
      style={{ "--strip": NET_DIFFICULTY_COLORS[difficulty].strip } as CSSProperties}
    >
      <NetRankMedal rank={places[index]} />
      <div className={styles.jacket}>
        {entry.cover && <NetImage src={entry.cover} />}
        <span className={`${styles.type} ${entry.dx ? styles.typeDx : styles.typeStd}`}>{common(`chartTypes.${entry.dx ? "dx" : "std"}`)}</span>
      </div>
      <div className={styles.song}>
        <div className={styles.songTitle}>{entry.name}</div>
        <div className={styles.holder}>
          {entry.mine ? t.rich("holder", { name: playerName, score: entry.mine, b: chunks => <b>{chunks}</b> }) : t("noHolder")}
        </div>
      </div>
      <span className={styles.metric}><small>{t(`metricShort.${metric}`)}</small>{format(entry.value)}</span>
    </div>
  ));

  return (
    <>
      <div className={styles.filters}>
        <NetSelect defaultValue="all" aria-label={t("scope.all")}>
          <option value="all">{t("scope.all")}</option>
          <option value="area" disabled>{t("scope.area")}</option>
          <option value="friends" disabled>{t("scope.friends")}</option>
        </NetSelect>
        <NetSelect value={metric} onChange={event => setMetric(event.target.value as NetRankingMetric)} aria-label={t(`metrics.${metric}`)}>
          {NET_RANKING_METRICS.map(id => <option key={id} value={id}>{t(`metrics.${id}`)}</option>)}
        </NetSelect>
        <NetSelect defaultValue="ex" aria-label={t("board.exRanking")}>
          <option value="ex">{t("board.exRanking")}</option>
          <option value="fun" disabled>{t("board.funRanking")}</option>
        </NetSelect>
        <NetDifficultyPills value={difficulty} onChange={setDifficulty} />
        <p className={styles.filterNote}>{t("note")}</p>
      </div>

      <div className={styles.boardHead}>
        <h3>{t(`metrics.${metric}`)}</h3>
        <p>{t("update", { date: updated })}</p>
        <span className={styles.rainbow} aria-hidden />
      </div>
      {rows.length === 0 ? (
        <NetEmpty>{t("empty")}</NetEmpty>
      ) : (
        <>
          {rows.slice(0, FREE_ROWS)}
          {rows.length > FREE_ROWS && <NetPaywall feature={t("paywall", { count: rows.length })}>{rows.slice(FREE_ROWS)}</NetPaywall>}
        </>
      )}
    </>
  );
}
