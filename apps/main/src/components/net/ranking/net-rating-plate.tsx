import styles from "./ranking.module.css";

/** DX NET's chunky rank numeral: gold, silver and bronze for the podium, blue below it. */
export function NetRankMedal({ rank }: { rank: number }) {
  const place = rank <= 3 ? String(rank) : "rest";
  return <span className={styles.medal} data-place={place}>{rank}</span>;
}
