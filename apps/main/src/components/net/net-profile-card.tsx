"use client";

import { useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Star } from "lucide-react";
import type { GameSnapshot } from "@/lib/games/player-view";
import { NET_TITLE_TYPES } from "./title-types";
import { NetKotoneScout } from "./friends/net-kotone-scout";
import { NetImage } from "./net-image";
import { NetRatingPlate } from "./net-rating-plate";
import { useNetTier } from "./premium/tier";
import styles from "./cards.module.css";

const STAR_TAPS = 5;

/**
 * The black-framed player card from the top of DX NET pages. `footer` fills the light-blue strip under it
 * (the home page's comment box), and `children` goes inside the frame after the card.
 */
export function NetProfileCard({ snapshot, footer, children }: { snapshot: GameSnapshot; footer?: ReactNode; children?: ReactNode }) {
  const t = useTranslations("net.common");
  const premium = useNetTier() === "premium";
  const starTaps = useRef(0);
  const [scout, setScout] = useState(false);
  return (
    <section className={styles.profile}>
      <div className={styles.profileCard}>
        <div className={styles.avatar}>
          {snapshot.iconUrl && <NetImage src={snapshot.iconUrl} />}
        </div>
        <div className={styles.profileBody}>
          <div className={styles.trophy} data-type={NET_TITLE_TYPES[snapshot.titleType] ?? "normal"}>{snapshot.title}</div>
          <div className={styles.nameRow}>
            <div className={styles.name}>{snapshot.displayName}</div>
            <NetRatingPlate rating={snapshot.rating} label={t("ratingPlate")} premium={premium} />
          </div>
          <div className={styles.metaRow}>
            {snapshot.courseRankUrl && <NetImage src={snapshot.courseRankUrl} />}
            {snapshot.classRankUrl && <NetImage src={snapshot.classRankUrl} />}
            {snapshot.stars != null && (
              <span className={styles.star}>
                <button
                  type="button"
                  className={styles.starButton}
                  aria-label={t("stars")}
                  onClick={() => {
                    starTaps.current++;
                    if (starTaps.current >= STAR_TAPS) setScout(true);
                  }}
                >
                  <Star size={16} fill="#ffd23a" color="#c2861a" aria-hidden />
                </button>
                ×{snapshot.stars}
              </span>
            )}
          </div>
        </div>
      </div>
      {footer && <div className={styles.profileFoot}>{footer}</div>}
      {children}
      {scout && <NetKotoneScout onClose={() => setScout(false)} />}
    </section>
  );
}

export function NetProfileComment({ children }: { children: ReactNode }) {
  return <div className={styles.comment}>{children}</div>;
}
