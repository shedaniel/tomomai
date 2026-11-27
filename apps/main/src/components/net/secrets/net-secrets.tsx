"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { NET_DIFFICULTY_COLORS } from "../difficulty";
import { NET_EGG_LEVELS, NET_EGGS, findNetEgg, forgetNetEggs, useNetEggs, useNetHiddenEggs, type NetEggLevel } from "../eggs/eggs";
import { getGrade } from "@/lib/games/presentation";
import { NetButton, NetInfo, NetLevel, NetNote, NetRank, NetStatus } from "../kit";
import { splitAchievement } from "../score";
import { NetStarArt } from "../net-art";
import styles from "./secrets.module.css";

const LEVELS = Object.keys(NET_EGG_LEVELS) as NetEggLevel[];

/** Chart levels each difficulty spreads its secrets over, easiest first. */
const LEVEL_RANGES: Record<NetEggLevel, [number, number]> = { basic: [1, 4], advanced: [5, 9], expert: [10, 12], master: [13, 15] };

function secretLevel(level: NetEggLevel, index: number, count: number): string {
  const [from, to] = LEVEL_RANGES[level];
  const steps = (to - from) * 2 + 1;
  const step = Math.min(steps - 1, Math.floor((index * steps) / count));
  return `${from + Math.floor(step / 2)}${step % 2 ? "+" : ""}`;
}

/** Every secret with its hint, grouped by difficulty like a chart list. Opening the page is the first secret. */
export function NetSecrets() {
  const t = useTranslations("net.eggs");
  const found = useNetEggs();
  const hiddenFound = useNetHiddenEggs();
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    findNetEgg("welcome");
  }, []);

  const percent = Math.round((found.length / NET_EGGS.length) * 100);
  // Scored like a chart: every secret found is 101.0000%.
  const score = Math.round((found.length / NET_EGGS.length) * 1_010_000);
  const complete = found.length === NET_EGGS.length;
  const grade = getGrade("maimai", score);
  const [whole, decimals] = splitAchievement((score / 10_000).toFixed(4));

  return (
    <>
      <NetInfo accent={t("page.introAccent")}>{t("page.intro", { total: NET_EGGS.length })}</NetInfo>

      <section className={styles.progress}>
        <div className={styles.progressHead}>{t("page.progress")}</div>
        <div className={styles.scoreRow}>
          <div>
            <div className={styles.scoreLabel}>{t("page.achievement")}</div>
            <div className={styles.score}>{whole}<small>{decimals}%</small></div>
          </div>
          <NetRank grade={grade} size={30} />
          {complete && <NetStatus status="ap+" />}
        </div>
        <div className={styles.progressCount}>
          <b>{found.length}</b> / {NET_EGGS.length}
        </div>
        <div className={styles.bar} role="progressbar" aria-valuemin={0} aria-valuemax={NET_EGGS.length} aria-valuenow={found.length}>
          <span style={{ width: `${percent}%` }} />
        </div>
        <p className={styles.verdict}>{complete ? t("page.complete") : t(`page.verdicts.${grade}`)}</p>
      </section>

      {LEVELS.map(level => {
        const ids = NET_EGG_LEVELS[level];
        const colors = NET_DIFFICULTY_COLORS[level];
        const foundHere = ids.filter(id => found.includes(id)).length;
        return (
          <section
            key={level}
            className={styles.level}
            style={{ "--fill": colors.fill, "--strip": colors.strip, "--ink": colors.ink } as CSSProperties}
          >
            <header className={styles.levelHead}>
              <b>{t(`page.levels.${level}`)}</b>
              <span>{t(`page.levelNotes.${level}`)}</span>
              <em>{t("page.levelCount", { found: foundHere, total: ids.length })}</em>
            </header>
            <ol className={styles.list}>
              {ids.map((id, index) => {
                const done = found.includes(id);
                return (
                  <li key={id} className={cn(styles.item, done && styles.done)}>
                    <NetLevel label={t("page.level")} level={secretLevel(level, index, ids.length)} />
                    <div className={styles.body}>
                      <div className={styles.name}>{t(`list.${id}.name`)}</div>
                      <p className={styles.hint}>{t(`list.${id}.hint`)}</p>
                    </div>
                    <div className={styles.side}>
                      {done ? <NetStarArt size={22} /> : <NetStarArt size={22} filled={false} />}
                      <span className={styles.state}>{done ? t("page.found") : t("page.notFound")}</span>
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        );
      })}

      {hiddenFound.length > 0 && (
        <section className={styles.offChart}>
          <header className={styles.levelHead}>
            <b>{t("page.offChart")}</b>
            <span>{t("page.offChartNote")}</span>
          </header>
          <ol className={styles.list}>
            {hiddenFound.map(id => (
              <li key={id} className={cn(styles.item, styles.done)}>
                <div className={styles.body}>
                  <div className={styles.name}>{t(`hidden.${id}.name`)}</div>
                  <p className={styles.hint}>{t(`hidden.${id}.hint`)}</p>
                </div>
                <div className={styles.side}><NetStarArt size={22} /></div>
              </li>
            ))}
          </ol>
        </section>
      )}

      <div className={styles.reset}>
        {confirming ? (
          <>
            <p>{t("page.resetConfirm", { count: found.length })}</p>
            <NetButton tone="orange" onClick={() => { forgetNetEggs(); setConfirming(false); }}>{t("page.resetYes")}</NetButton>
            <NetButton onClick={() => setConfirming(false)}>{t("page.resetNo")}</NetButton>
          </>
        ) : (
          <button type="button" className={styles.resetLink} onClick={() => setConfirming(true)}>{t("page.reset")}</button>
        )}
      </div>
      <NetNote>{t("page.note")}</NetNote>
    </>
  );
}
