"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { NetRank, netKitStyles } from "../kit";
import { NetDifficultyPills } from "../net-difficulty-pills";
import {
  PLAY_DATA_DIFFICULTIES,
  PLAY_DATA_GRADE_ROWS,
  PLAY_DATA_STATUS_ROWS,
  type PlayDataFilter,
  type PlayDataSummary,
} from "./summary";
import styles from "./play-data.module.css";

function Label({ label }: { label: string }) {
  const plus = label.endsWith("+");
  return <>{plus ? label.slice(0, -1) : label}{plus && <sup>+</sup>}</>;
}

const STATUS_TONES: Readonly<Record<string, string>> = { AP: styles.ap, FC: styles.fc, FDX: styles.fdx, FS: styles.fs };

/** ALL plus the difficulty pills over the two-column "count/total" grid. */
export function NetPlayDataGrid({ summary }: { summary: PlayDataSummary }) {
  const t = useTranslations("net.playData");
  const [filter, setFilter] = useState<PlayDataFilter>("all");
  const bucket = summary[filter];
  const format = (count: number) => `${count.toLocaleString("en-US")}/${bucket.total.toLocaleString("en-US")}`;

  return (
    <>
      <div className={styles.filters}>
        <button
          type="button"
          role="tab"
          aria-selected={filter === "all"}
          onClick={() => setFilter("all")}
          className={cn(netKitStyles.pill, styles.all, filter === "all" && netKitStyles.pillActive)}
        >
          {t("all")}
        </button>
        <NetDifficultyPills value={filter} onChange={setFilter} difficulties={PLAY_DATA_DIFFICULTIES} />
      </div>
      <div className={styles.grid}>
        {PLAY_DATA_GRADE_ROWS.map((row, index) => {
          const status = PLAY_DATA_STATUS_ROWS[index];
          return (
            <div key={row.label} className={styles.pair}>
              <div className={styles.cell}>
                <b className={cn(styles.badge, row.label === "CLEAR" && styles.clear)}>
                  {row.label === "CLEAR" ? t("clear") : <NetRank grade={row.label} size={16} />}
                </b>
                <span>{format(bucket.grades[index])}</span>
              </div>
              <div className={styles.cell}>
                <b className={cn(styles.badge, styles.status, STATUS_TONES[status.label.replace("+", "")])}>
                  <Label label={status.label} />
                </b>
                <span>{format(bucket.statuses[index])}</span>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
