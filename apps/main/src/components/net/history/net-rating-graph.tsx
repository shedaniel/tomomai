import styles from "./history.module.css";

const WIDTH = 400;
const HEIGHT = 140;
const PAD = 8;

/** Rating over snapshots, oldest on the left. Plain SVG so it renders on the server. */
export function NetRatingGraph({ ratings, label }: { ratings: number[]; label: string }) {
  const min = Math.min(...ratings);
  const max = Math.max(...ratings);
  const span = Math.max(max - min, 1);
  const step = ratings.length > 1 ? (WIDTH - PAD * 2) / (ratings.length - 1) : 0;
  const points = ratings
    .map((rating, index) => `${(PAD + index * step).toFixed(1)},${(HEIGHT - PAD - ((rating - min) / span) * (HEIGHT - PAD * 2)).toFixed(1)}`)
    .join(" ");
  return (
    <figure className={styles.graph}>
      <div className={styles.graphAxis}><span>{max}</span><span>{min}</span></div>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" role="img" aria-label={label}>
        <polyline fill="none" stroke="#2b8fe6" strokeWidth={3} strokeLinejoin="round" vectorEffect="non-scaling-stroke" points={points} />
      </svg>
    </figure>
  );
}
