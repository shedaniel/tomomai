import type { ComponentProps, CSSProperties, ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { NET_DIFFICULTY_COLORS, type NetDifficulty } from "./difficulty";
import styles from "./kit.module.css";

/** Building blocks of the DX NET look. None of them read translations, so pass copy in. */

export function NetTitle({ children }: { children: ReactNode }) {
  return <h2 className={styles.title}><div>{children}</div></h2>;
}

export function NetInfo({ children, accent }: { children: ReactNode; accent?: ReactNode }) {
  return (
    <div className={styles.info}>
      {children}
      {accent && <><br /><span className={styles.accent}>{accent}</span></>}
    </div>
  );
}

export function NetSection({ children }: { children: ReactNode }) {
  return <h3 className={styles.section}>{children}</h3>;
}

export function NetPanel({ heading, children, className, style }: { heading?: ReactNode; children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <section className={cn(styles.panel, className)} style={style}>
      {heading && <h4 className={styles.panelHeading}>{heading}</h4>}
      {children}
    </section>
  );
}

export function NetNote({ children }: { children: ReactNode }) {
  return <p className={styles.note}>{children}</p>;
}

export function NetEmpty({ children }: { children: ReactNode }) {
  return <div className={styles.empty}>{children}</div>;
}

type ButtonTone = "blue" | "orange";

export function NetButton({ tone = "blue", className, ...props }: ComponentProps<"button"> & { tone?: ButtonTone }) {
  return <button type="button" className={cn(styles.button, tone === "orange" && styles.buttonOrange, className)} {...props} />;
}

export function NetButtonLink({ tone = "blue", className, ...props }: ComponentProps<typeof Link> & { tone?: ButtonTone }) {
  return <Link className={cn(styles.button, tone === "orange" && styles.buttonOrange, className)} {...props} />;
}

export function NetSelect({ className, ...props }: ComponentProps<"select">) {
  return <label className={cn(styles.select, className)}><select {...props} /></label>;
}

export function NetLevel({ label, level }: { label: string; level: string }) {
  return <div className={styles.level}><span>{label}</span>{level}</div>;
}

export function NetDifficultyLabel({ difficulty, children, className }: { difficulty: NetDifficulty; children: ReactNode; className?: string }) {
  return (
    <b className={cn(styles.diffLabel, className)} style={{ ["--net-diff-ink" as string]: NET_DIFFICULTY_COLORS[difficulty].ink }}>
      {children}
    </b>
  );
}

const RANK_LETTER_COLORS: Readonly<Record<string, readonly string[]>> = {
  SSS: ["#ffc93a", "#5ab8ff", "#ff5a6e"],
  SS: ["#ffc93a", "#ffc93a"],
  S: ["#ffc93a"],
};
const RANK_FAMILY_COLOR: Readonly<Record<string, string>> = { A: "#ff7aa8", B: "#5ab8ff", C: "#b9b9b9", D: "#b9b9b9" };

/** DX NET's chunky rank glyphs: one colored letter each, with the plus in an orange coin. */
export function NetRank({ grade, size, className }: { grade: string; size?: number; className?: string }) {
  const plus = grade.endsWith("+");
  const letters = plus ? grade.slice(0, -1) : grade;
  const colors = RANK_LETTER_COLORS[letters] ?? Array.from(letters, () => RANK_FAMILY_COLOR[letters[0]] ?? "#b9b9b9");
  return (
    <span className={cn(styles.rank, className)} style={size ? { fontSize: size } : undefined} aria-label={grade}>
      {Array.from(letters, (letter, index) => (
        <span key={index} className={styles.rankLetter} style={{ color: colors[index] }} aria-hidden>{letter}</span>
      ))}
      {plus && <span className={styles.rankPlus} aria-hidden>+</span>}
    </span>
  );
}

const STATUS_COLORS: Readonly<Record<string, string>> = {
  fc: "#3fc23f",
  "fc+": "#2fa82f",
  ap: "#ff8a1a",
  "ap+": "#ff5a1a",
  sync: "#7a9ab8",
  fs: "#2b8fe6",
  "fs+": "#1d6fd6",
  fdx: "#ff7a1a",
  "fdx+": "#e0457b",
};

/** A medal slot: grey when empty, colored with its short label when earned. */
export function NetStatus({ status }: { status: string | null }) {
  const earned = status && status !== "none" ? status : null;
  return (
    <span className={styles.status} style={earned ? { background: STATUS_COLORS[earned] ?? "#888" } : undefined}>
      {earned?.toUpperCase()}
    </span>
  );
}

export { styles as netKitStyles };
