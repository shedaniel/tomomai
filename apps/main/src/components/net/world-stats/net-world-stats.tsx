"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { NET_DIFFICULTIES, netDifficulty, type NetDifficulty } from "../difficulty";
import { NetEmpty, NetNote, NetPanel, NetSelect, netKitStyles } from "../kit";
import { NetDifficultyPills } from "../net-difficulty-pills";
import { NetMusicRow } from "../net-music-row";
import { WORLD_METRICS, WORLD_METRIC_IDS, type WorldMetric, type WorldScore } from "./metrics";
import styles from "./world-stats.module.css";

const SHOWN = 30;
const DIFFICULTIES = NET_DIFFICULTIES.filter(difficulty => difficulty !== "utage");

/** DX NET's world clear rates, computed over a world of one player. */
export function NetWorldStats({ scores }: { scores: readonly WorldScore[] }) {
  const t = useTranslations("net.worldStats");
  const [level, setLevel] = useState("all");
  const [metric, setMetric] = useState<WorldMetric>("sssp");
  const [order, setOrder] = useState<"desc" | "asc">("desc");
  const [hideAchieved, setHideAchieved] = useState(false);
  const [difficulty, setDifficulty] = useState<NetDifficulty | "all">("all");

  const levels = useMemo(() => {
    const byLevel = new Map<string, number>();
    for (const score of scores) byLevel.set(score.level, Math.min(byLevel.get(score.level) ?? Infinity, score.levelPrecise));
    return [...byLevel].sort((a, b) => a[1] - b[1]).map(([label]) => label);
  }, [scores]);

  const filtered = useMemo(() => scores.filter(score =>
    (level === "all" || score.level === level)
    && (difficulty === "all" ? netDifficulty(score.difficultyCode) !== "utage" : netDifficulty(score.difficultyCode) === difficulty),
  ), [scores, level, difficulty]);

  const test = WORLD_METRICS[metric];
  const achieved = filtered.filter(test).length;
  const worldRate = filtered.length ? (achieved / filtered.length) * 100 : 0;

  const rows = useMemo(() => {
    const sign = order === "desc" ? -1 : 1;
    return filtered
      .filter(score => !hideAchieved || !test(score))
      .map(score => ({ score, hit: test(score) }))
      .sort((a, b) => sign * (Number(a.hit) - Number(b.hit)) || sign * (a.score.levelPrecise - b.score.levelPrecise) || a.score.songName.localeCompare(b.score.songName));
  }, [filtered, hideAchieved, order, test]);

  return (
    <>
      <NetPanel>
        <div className={styles.population}>
          <em>{t("population")}</em><b>{t("populationValue")}</b><small>{t("populationNote")}</small>
        </div>
        <div className={styles.rate}>
          {t("worldRate", { metric: t(`metrics.${metric}`) })}
          <b>{t("rate", { rate: worldRate.toFixed(2) })}</b>
          {t("charts", { count: filtered.length })}
        </div>
        <NetSelect value={level} onChange={event => setLevel(event.target.value)} aria-label={t("allLevels")}>
          <option value="all">{t("allLevels")}</option>
          {levels.map(label => <option key={label} value={label}>{t("level", { level: label })}</option>)}
        </NetSelect>
        <NetSelect value={metric} onChange={event => setMetric(event.target.value as WorldMetric)} aria-label={t(`metrics.${metric}`)}>
          {WORLD_METRIC_IDS.map(id => <option key={id} value={id}>{t(`metrics.${id}`)}</option>)}
        </NetSelect>
        <NetSelect value={order} onChange={event => setOrder(event.target.value as "desc" | "asc")} aria-label={t(order === "desc" ? "descending" : "ascending")}>
          <option value="desc">{t("descending")}</option>
          <option value="asc">{t("ascending")}</option>
        </NetSelect>
        <label className={styles.check}>
          <input type="checkbox" checked={hideAchieved} onChange={event => setHideAchieved(event.target.checked)} />
          {t("hideAchieved")}
        </label>
        <div className={styles.filters}>
          <button
            type="button"
            role="tab"
            aria-selected={difficulty === "all"}
            onClick={() => setDifficulty("all")}
            className={cn(netKitStyles.pill, styles.all, difficulty === "all" && netKitStyles.pillActive)}
          >
            {t("all")}
          </button>
          <NetDifficultyPills value={difficulty} onChange={setDifficulty} difficulties={DIFFICULTIES} />
        </div>
        <div className={styles.notes}>{t("notes.line1")}<br />{t("notes.line2")}<br />{t("notes.line3")}</div>
      </NetPanel>
      {rows.length === 0 ? (
        <NetEmpty>{t("empty")}</NetEmpty>
      ) : (
        <div className={styles.list}>
          {rows.slice(0, SHOWN).map(({ score, hit }, index) => (
            <NetMusicRow
              key={index}
              score={score}
              showStatus={false}
              extra={<span className={styles.extra}>{t("rate", { rate: hit ? "100.00" : "0.00" })}<small>{t("players", { count: hit ? 1 : 0 })}</small></span>}
            />
          ))}
        </div>
      )}
      {rows.length > SHOWN && <NetNote>{t("more", { count: rows.length - SHOWN })}</NetNote>}
    </>
  );
}
