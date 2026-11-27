"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import styles from "./history.module.css";

export type NetHistoryRow = {
  /** ISO timestamp. */
  date: string;
  rating: number;
  /** Change from the snapshot before it, null for the first one. */
  delta: number | null;
  /** The chart that gained the most rating since the snapshot before, when known. */
  song: string | null;
};

const ROW_COLORS = ["#ff7f73", "#ffb23a", "#9be03a", "#3fbcff", "#b56cf7"];
const BIG_GAIN = 10;

function formatDate(iso: string) {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, "0");
  return {
    day: `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())}`,
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  };
}

export function NetHistoryList({ rows }: { rows: NetHistoryRow[] }) {
  const t = useTranslations("net.history.delta");
  const joke = ({ delta, song }: NetHistoryRow) => {
    if (delta == null) return t("first");
    if (delta > 0 && song) return t("song", { song });
    if (delta >= BIG_GAIN) return t("bigUp");
    if (delta > 0) return t("up");
    if (delta === 0) return t("flat");
    return t("down");
  };
  return (
    <ol className={styles.list}>
      {rows.map((row, index) => {
        const { day, time } = formatDate(row.date);
        return (
          <li key={`${row.date}-${index}`} className={styles.row} style={{ ["--row" as string]: ROW_COLORS[index % ROW_COLORS.length] }}>
            {/* Local time differs between server and browser. */}
            <time dateTime={row.date} className={styles.date} suppressHydrationWarning>{day}<br />{time}</time>
            <span className={styles.value}>{row.rating}</span>
            <span className={styles.delta}>
              {row.delta != null && (
                <b className={cn(row.delta > 0 && styles.up, row.delta < 0 && styles.down)}>
                  {row.delta > 0 ? `+${row.delta}` : row.delta < 0 ? `−${-row.delta}` : "±0"}
                </b>
              )}
              <span>{joke(row)}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
