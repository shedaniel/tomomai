"use client";

import { useState, type CSSProperties } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { NET_DIFFICULTY_COLORS } from "../difficulty";
import { findNetEgg } from "../eggs/eggs";
import { NetButton, NetButtonLink, NetDifficultyLabel, NetLevel, NetPanel, NetRank, NetStatus } from "../kit";
import { NetStarArt } from "../net-art";
import { NetImage } from "../net-image";
import { NetPaywall } from "../net-paywall";
import { NetPlayTime } from "../records/net-play-time";
import { netScoreView } from "../score";
import styles from "./song-detail.module.css";

export type NetSongDetailSong = {
  name: string;
  artist: string;
  cover: string;
  genre: string;
  typeCode: number;
  version: string | null;
  bpm: number | null;
};

export type NetSongDetailChart = {
  difficultyCode: number;
  level: string;
  constant: string | null;
  estimated: boolean;
  maxDxScore: number | null;
  stars: number;
  score: { scoreValue: number; secondaryScore: number | null; comboStatus: number; syncStatus: number } | null;
  plays: { lastPlayedAt: string; count: number } | null;
};

const FAVORITE_PRESSES = 5;

function Stars({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className={styles.stars} aria-label={String(count)}>
      {Array.from({ length: Math.min(count, 5) }, (_, index) => <NetStarArt key={index} size={13} />)}
    </span>
  );
}

function ChartCard({ chart, song, playsHidden }: { chart: NetSongDetailChart; song: NetSongDetailSong; playsHidden: boolean }) {
  const t = useTranslations("net.songDetail");
  const common = useTranslations("net.common");
  const view = netScoreView({ songName: song.name, level: chart.level, difficultyCode: chart.difficultyCode, typeCode: song.typeCode, ...chart.score });
  const colors = NET_DIFFICULTY_COLORS[view.difficulty];
  return (
    <article className={styles.chart} style={{ "--fill": colors.fill, "--strip": colors.strip } as CSSProperties}>
      <div className={styles.chartHead}>
        <NetDifficultyLabel difficulty={view.difficulty}>{common(`difficulties.${view.difficulty}`)}</NetDifficultyLabel>
        {chart.constant && (
          <span className={styles.constant}>
            {t("constant", { constant: chart.constant })}
            {chart.estimated && <small>{t("estimated")}</small>}
          </span>
        )}
      </div>
      <div className={styles.chartBody}>
        <NetLevel label={common("level")} level={chart.level} />
        <div className={styles.medals}>
          {view.grade ? <NetRank grade={view.grade} size={22} /> : <span className={styles.noRank} />}
          <NetStatus status={view.combo} />
          <NetStatus status={view.sync} />
          <Stars count={chart.stars} />
        </div>
        {(chart.plays || chart.score) && (
          <dl className={styles.plays}>
            <div>
              <dt>{t("lastPlayed")}</dt>
              <dd>{chart.plays ? <NetPlayTime at={chart.plays.lastPlayedAt} /> : playsHidden ? t("hiddenPlays") : t("noRecent")}</dd>
            </div>
            {chart.plays && (
              <div>
                <dt>{t("playCount")}</dt>
                <dd>{t("playCountValue", { count: chart.plays.count })}</dd>
              </div>
            )}
          </dl>
        )}
      </div>
      {view.achievement ? (
        <div className={styles.scoreLine}>
          <span className={styles.pct}>{view.achievement}</span>
          <span className={styles.dx}>
            <em>{common("dxScore")}</em>
            {view.dxScore != null
              ? chart.maxDxScore ? t("dxScore", { score: view.dxScore.toLocaleString(), max: chart.maxDxScore.toLocaleString() }) : view.dxScore.toLocaleString()
              : "-"}
          </span>
        </div>
      ) : (
        <p className={styles.unplayed}>{t("notPlayed")}</p>
      )}
    </article>
  );
}

/** DX NET's song page: the jacket card, then one row per difficulty with the player's best. */
export function NetSongDetail({ song, charts, playsHidden, playerName, backHref }: {
  song: NetSongDetailSong;
  charts: NetSongDetailChart[];
  playsHidden: boolean;
  playerName: string;
  backHref: string;
}) {
  const t = useTranslations("net.songDetail");
  const common = useTranslations("net.common");
  const [favoritePresses, setFavoritePresses] = useState(0);
  const favorited = favoritePresses >= FAVORITE_PRESSES;
  const pressFavorite = () => {
    const presses = favoritePresses + 1;
    setFavoritePresses(presses);
    if (presses === FAVORITE_PRESSES) findNetEgg("favoritesSpam");
  };
  const chartType = netScoreView({ songName: song.name, level: "", difficultyCode: 0, typeCode: song.typeCode }).chartType;
  return (
    <>
      <section className={styles.card}>
        <div className={styles.jacket}>{song.cover && <NetImage src={song.cover} />}</div>
        <div className={styles.info}>
          <div className={styles.infoTop}>
            <span className={cn(styles.tag, chartType === "dx" ? styles.tagDx : styles.tagStd)}>{common(`chartTypes.${chartType}`)}</span>
            <span className={styles.genre}>{song.genre}</span>
          </div>
          <h3 className={styles.name}>{song.name}</h3>
          <p className={styles.artist}>{song.artist}</p>
          <dl className={styles.meta}>
            {song.version && <div><dt>{t("version")}</dt><dd>{song.version}</dd></div>}
            {song.bpm && <div><dt>{t("bpm")}</dt><dd>{song.bpm}</dd></div>}
          </dl>
          <NetButton className={styles.favorite} aria-pressed={favorited} disabled={favorited} onClick={pressFavorite}>
            {favorited ? t("favorite.added") : t("favorite.add")}
          </NetButton>
          {favoritePresses > 0 && (
            <p key={favoritePresses} className={styles.favoriteNope} role="status">
              {favorited ? t("favorite.fine") : t(`favorite.nope.${favoritePresses}`)}
            </p>
          )}
        </div>
      </section>
      {charts.map(chart => <ChartCard key={chart.difficultyCode} chart={chart} song={song} playsHidden={playsHidden} />)}
      <NetPaywall feature={t("worldRecord.feature")} requires="premium">
        <NetPanel heading={t("worldRecord.heading")}>
          <p className={styles.record}>{t("worldRecord.holder", { name: playerName })}</p>
          <p className={styles.recordNote}>{t("worldRecord.note")}</p>
        </NetPanel>
      </NetPaywall>
      <div className={styles.actions}>
        <NetButtonLink href={backHref} tone="orange">{t("back")}</NetButtonLink>
      </div>
    </>
  );
}
