import { cn } from "@/lib/utils";
import styles from "./rating-plate.module.css";

const TIERS: readonly (readonly [number, string])[] = [
  [15000, "rainbow"],
  [14500, "platinum"],
  [14000, "gold"],
  [13000, "silver"],
  [12000, "bronze"],
  [10000, "purple"],
  [7000, "red"],
  [4000, "yellow"],
  [2000, "green"],
  [1000, "blue"],
  [0, "white"],
];

export function netRatingTier(rating: number): string {
  return TIERS.find(([floor]) => rating >= floor)?.[1] ?? "white";
}

/** Breaks between the kana and the Latin word so it never splits mid-word. */
function splitLabel(label: string): string[] {
  const match = label.match(/^([^\x00-\x7F]+)(.+)$/);
  return match ? [match[1], match[2]] : [label];
}

/** The colored rating plate: the frame changes color with the rating band, like DX NET's. */
export function NetRatingPlate({ rating, label, text, premium, className }: {
  rating: number; label: string; text?: string; premium?: boolean; className?: string;
}) {
  return (
    <span className={cn(styles.plate, premium && styles.premium, className)} data-tier={netRatingTier(rating)}>
      <em>{splitLabel(label).map(line => <span key={line}>{line}</span>)}</em>
      <b>{text ?? rating}</b>
    </span>
  );
}
