import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";
import styles from "./stamp-card.module.css";

const INK = "#4b3a2f";
export const NET_STAMPS_PER_CARD = 10;

export const NET_STAMP_THEMES = {
  coin: { band: "#ffa53a", ink: "#e07a00" },
  note: { band: "#c9f08a", ink: "#4fae2a" },
  heart: { band: "#a8e2ff", ink: "#2b9de8" },
  key: { band: "#ffc4d8", ink: "#e0457b" },
  star: { band: "#d8c4ff", ink: "#7a4fd8" },
} as const;
export type NetStampMotif = keyof typeof NET_STAMP_THEMES;

const MOTIFS: Readonly<Record<NetStampMotif, ReactNode>> = {
  coin: (
    <>
      <circle cx="16" cy="16" r="9" fill="currentColor" opacity={0.25} stroke="currentColor" strokeWidth={2} />
      <path d="M14 12l3-2v12" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  note: (
    <>
      <circle cx="16" cy="16" r="9" fill="none" stroke="currentColor" strokeWidth={4} />
      <circle cx="16" cy="16" r="3" fill="currentColor" />
    </>
  ),
  heart: <path d="M16 25s-9-5.6-9-11.6a4.8 4.8 0 0 1 9-2.6 4.8 4.8 0 0 1 9 2.6C25 19.4 16 25 16 25z" fill="currentColor" opacity={0.85} />,
  key: (
    <>
      <circle cx="11" cy="16" r="5" fill="none" stroke="currentColor" strokeWidth={2.6} />
      <path d="M16 16h10M22 16v4M25 16v3" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" />
    </>
  ),
  star: <path d="M16 6l2.9 6 6.5.8-4.8 4.5 1.2 6.5-5.8-3.2-5.8 3.2 1.2-6.5-4.8-4.5 6.5-.8z" fill="currentColor" opacity={0.85} />,
};

export function NetStamp({ motif, filled }: { motif: NetStampMotif; filled: boolean }) {
  return (
    <span className={cn(styles.stamp, filled && styles.stampFilled)}>
      <svg viewBox="0 0 32 32" aria-hidden>{MOTIFS[motif]}</svg>
    </span>
  );
}

/** A two-row card of ten stamps, a reward box on the right, and a COMPLETE slap once it fills. */
export function NetStampCard({ label, motif, filled, completeLabel, rewardLabel, source, filledLabel }: {
  label: string;
  motif: NetStampMotif;
  filled: number;
  completeLabel: string;
  rewardLabel: string;
  source: string;
  filledLabel: string;
}) {
  const theme = NET_STAMP_THEMES[motif];
  const complete = filled >= NET_STAMPS_PER_CARD;
  return (
    <section className={styles.entry}>
      <h4 className={styles.label}>{label}</h4>
      <div className={styles.card} role="group" style={{ "--stamp-band": theme.band, "--stamp-ink": theme.ink } as CSSProperties} aria-label={filledLabel}>
        <div className={styles.stamps}>
          {Array.from({ length: NET_STAMPS_PER_CARD }, (_, index) => (
            <NetStamp key={index} motif={motif} filled={index < filled} />
          ))}
        </div>
        <svg className={styles.arrow} viewBox="0 0 12 16" aria-hidden>
          <path d="M2 2l8 6-8 6z" fill="#fff" stroke={INK} strokeWidth={1.6} strokeLinejoin="round" />
        </svg>
        <div className={styles.reward}>
          <NetStamp motif={motif} filled={complete} />
          <span>{rewardLabel}</span>
        </div>
        {complete && <span className={styles.complete} aria-hidden>{completeLabel}</span>}
      </div>
      <div className={styles.source}>
        <span>{source}</span>
        <b>{filledLabel}</b>
      </div>
    </section>
  );
}
