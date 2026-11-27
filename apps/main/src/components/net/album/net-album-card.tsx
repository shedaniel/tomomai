import type { CSSProperties, ReactNode } from "react";
import { NetStarArt } from "../net-art";
import { NET_DIFFICULTY_COLORS, type NetDifficulty } from "../difficulty";
import styles from "./album.module.css";

/** One DX NET album entry: difficulty strip with the date, dark title bar, then the result photo. */
export function NetAlbumCard({
  difficulty,
  difficultyLabel,
  songName,
  takenAt,
  children,
  footer,
}: {
  difficulty: NetDifficulty;
  difficultyLabel: string;
  songName: string;
  takenAt?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const colors = NET_DIFFICULTY_COLORS[difficulty];
  return (
    <article className={styles.card} style={{ "--fill": colors.strip, "--ink": colors.ink } as CSSProperties}>
      <div className={styles.head}>
        <b className={styles.diff}>{difficultyLabel}</b>
        <span className={styles.stars} aria-hidden>{[0, 1, 2, 3].map(index => <NetStarArt key={index} size={13} filled={false} />)}</span>
        {takenAt && <span className={styles.date}>{takenAt}</span>}
      </div>
      <div className={styles.titleBar}>{songName}</div>
      {children}
      {footer && <div className={styles.venue}>{footer}</div>}
    </article>
  );
}

export function NetAlbumPhoto({ src, alt }: { src: string; alt: string }) {
  return (
    <a className={styles.photo} href={src} target="_blank" rel="noreferrer">
      {/* eslint-disable-next-line @next/next/no-img-element -- album photos are pre-optimized R2 uploads */}
      <img src={src} alt={alt} loading="lazy" />
    </a>
  );
}

/** A result screen drawn in CSS, for when there is no photo to show. */
export function NetAlbumResultMock({
  icon,
  frameText,
  difficultyLine,
  songName,
  achievement,
  judgements,
  footer,
  style,
}: {
  icon: ReactNode;
  frameText: ReactNode;
  difficultyLine: ReactNode;
  songName: ReactNode;
  achievement: [string, string];
  judgements: readonly { label: string; value: ReactNode }[];
  footer: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div className={styles.result} style={style}>
      <div className={styles.frame}><div><i aria-hidden>{icon}</i>{frameText}</div></div>
      <div className={styles.resultRight}>
        <div className={styles.resultDiff}>{difficultyLine}<small>{songName}</small></div>
        <div className={styles.big}>{achievement[0]}<small>{achievement[1]}</small></div>
        <div className={styles.judgements}>
          {judgements.map(({ label, value }) => <span key={label}>{label} <b>{value}</b></span>)}
        </div>
      </div>
      <div className={styles.footer}>{footer}</div>
    </div>
  );
}
