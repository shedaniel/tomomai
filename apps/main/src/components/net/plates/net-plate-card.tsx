import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { NetLockArt } from "../net-art";
import styles from "./plates.module.css";

export type NetPlateTone = "kiwami" | "shou" | "shin" | "maimai" | "login" | "april" | "course";

/** A plate as the list shows it, with every string already translated. */
export type NetPlateData = {
  id: string;
  group: string;
  tag: string;
  name: string;
  condition: string;
  banner: string;
  tone: NetPlateTone;
  earned: boolean;
  progress?: { label: string; ratio: number };
  href?: string;
  hrefLabel?: string;
};

export function NetPlateCard({ plate, stamp, lockedLabel }: { plate: NetPlateData; stamp?: string; lockedLabel: string }) {
  return (
    <div className={cn(styles.plate, !plate.earned && styles.plateLocked)}>
      <span className={styles.tag}>{plate.tag}</span>
      <div className={styles.name}>{plate.name}</div>
      <div className={styles.condition}>{plate.condition}</div>
      <div className={cn(styles.banner, plate.earned ? styles[plate.tone] : styles.bannerLocked)}>
        {stamp && <em className={styles.stamp}>{stamp}</em>}
        {plate.earned ? <span>{plate.banner}</span> : <span className={styles.lockedLabel}><NetLockArt size={16} />{lockedLabel}</span>}
      </div>
      {plate.progress && (
        <div className={styles.progress}>
          <div className={styles.bar}><i style={{ width: `${Math.round(plate.progress.ratio * 100)}%` }} /></div>
          <span>{plate.progress.label}</span>
        </div>
      )}
      {plate.href && plate.hrefLabel && (
        <div className={styles.cta}><Link href={plate.href}>{plate.hrefLabel}</Link></div>
      )}
    </div>
  );
}
