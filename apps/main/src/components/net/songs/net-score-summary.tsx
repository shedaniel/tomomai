"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { NetRank } from "../kit";
import type { NetChartEntry } from "./data";
import styles from "./songs.module.css";

const CLEAR = 800_000;
const GRADES = [
  { label: "S", min: 970_000 },
  { label: "S+", min: 980_000 },
  { label: "SS", min: 990_000 },
  { label: "SS+", min: 995_000 },
  { label: "SSS", min: 1_000_000 },
  { label: "SSS+", min: 1_005_000 },
];
// Status codes rise with the medal, so "at least FC" is a code at or above FC's.
const COMBOS = [{ label: "FC", code: 1 }, { label: "FC+", code: 2 }, { label: "AP", code: 3 }, { label: "AP+", code: 4 }];
const SYNCS = [{ label: "FS", code: 2 }, { label: "FS+", code: 3 }, { label: "FDX", code: 4 }, { label: "FDX+", code: 5 }];

function Medal({ label, tone }: { label: string; tone: "clear" | "ap" | "sync" | "fdx" }) {
  const plus = label.endsWith("+");
  return <b className={cn(styles.medal, styles[tone])}>{plus ? label.slice(0, -1) : label}{plus && <sup>+</sup>}</b>;
}

function Cell({ children, count, total }: { children: ReactNode; count: number; total: number }) {
  return <span className={styles.cell}>{children}<small>{count}/{total}</small></span>;
}

/** DX NET's black-bordered tally of grades and medals for the charts in view. */
export function NetScoreSummary({ entries }: { entries: NetChartEntry[] }) {
  const t = useTranslations("net.songs.summary");
  const total = entries.length;
  const count = (test: (chart: NetChartEntry["chart"]) => boolean) => entries.reduce((n, entry) => n + (test(entry.chart) ? 1 : 0), 0);
  const atLeast = (min: number) => count(chart => chart[2] != null && chart[2] >= min);

  return (
    <div className={styles.summary}>
      <div className={styles.summaryRow}>
        <Cell count={atLeast(CLEAR)} total={total}><Medal label={t("clear")} tone="clear" /></Cell>
        {GRADES.map(grade => (
          <Cell key={grade.label} count={atLeast(grade.min)} total={total}><NetRank grade={grade.label} size={13} /></Cell>
        ))}
      </div>
      <div className={styles.summaryRow}>
        <span /><span /><span />
        {COMBOS.map(combo => (
          <Cell key={combo.label} count={count(chart => chart[4] >= combo.code)} total={total}>
            <Medal label={combo.label} tone={combo.code >= 3 ? "ap" : "clear"} />
          </Cell>
        ))}
      </div>
      <div className={styles.summaryRow}>
        <span /><span />
        <Cell count={count(chart => chart[5] >= 1)} total={total}><Medal label={t("sync")} tone="sync" /></Cell>
        {SYNCS.map(sync => (
          <Cell key={sync.label} count={count(chart => chart[5] >= sync.code)} total={total}>
            <Medal label={sync.label} tone={sync.code >= 4 ? "fdx" : "sync"} />
          </Cell>
        ))}
      </div>
      <p className={styles.summaryNote}>{t("note", { total: total.toLocaleString() })}</p>
    </div>
  );
}
