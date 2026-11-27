"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { NetStarArt } from "../net-art";
import { useNetTier } from "../premium/tier";
import { NetRatingPlate } from "../net-rating-plate";
import { findNetEgg } from "../eggs/eggs";
import { NetAiMascot, type NetAiMood } from "./net-ai-mascot";
import styles from "./friends.module.css";

export const NET_AI_RATING = 99999;

const POKE_LINES = 11;
const POKES_TO_WIN = 10;

function pokeMood(pokes: number): NetAiMood {
  if (pokes >= POKES_TO_WIN) return 4;
  if (pokes >= 7) return 3;
  if (pokes >= 4) return 2;
  return pokes > 0 ? 1 : 0;
}

/** A DX NET friend card, filled in with tomomai AI. Favorite and rival only switch on with the Premium Course. */
export function NetAiFriendCard({ roast, playerRating, shopHref }: { roast: string; playerRating: number | null; shopHref: string }) {
  const t = useTranslations("net.friends");
  const premium = useNetTier() === "premium";
  const [favorite, setFavorite] = useState(false);
  const [rival, setRival] = useState(false);
  const [notice, setNotice] = useState<ReactNode>(null);
  const [pokes, setPokes] = useState(0);

  const poke = () => {
    const next = pokes + 1;
    setPokes(next);
    if (next === POKES_TO_WIN) findNetEgg("aiPoke");
  };

  const premiumOnly = (feature: string) => setNotice(
    <>
      {t("actions.premiumOnly", { feature })} <Link href={shopHref}>{t("actions.toShop")}</Link>
    </>,
  );

  return (
    <article className={styles.friend}>
      <NetStarArt size={34} className={styles.corner} />
      <NetFriendFace
        avatar={
          <button type="button" className={styles.pokeButton} onClick={poke} aria-label={t("ai.pokeLabel")}>
            <span key={pokes} className={pokes > 0 ? (pokes >= POKES_TO_WIN ? styles.slump : styles.shake) : undefined}>
              <NetAiMascot mood={pokeMood(pokes)} />
            </span>
          </button>
        }
        title={t("ai.title")}
        name={t("ai.name")}
        rating={NET_AI_RATING}
        plateLabel={t("plateLabel")}
        dan={t("ai.dan")}
        classRank={t("ai.classRank")}
        stars={t("ai.stars")}
      />
      {pokes > 0
        ? <div className={styles.pokeLine} role="status">{t(`ai.poke.${Math.min(pokes, POKE_LINES) - 1}`)}</div>
        : <div className={styles.comment}>{roast}</div>}
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.vs}
          onClick={() => setNotice(playerRating == null ? t("actions.vsNoData") : t("actions.vsResult", { rating: playerRating }))}
        >
          {t("actions.vs")}
        </button>
        <button
          type="button"
          className={styles.fav}
          aria-pressed={favorite}
          onClick={() => {
            if (!premium) return premiumOnly(t("actions.favoriteFeature"));
            setFavorite(!favorite);
            setNotice(favorite ? null : t("actions.favorited"));
          }}
        >
          {favorite ? t("actions.unfavorite") : t("actions.favorite")}
        </button>
        <button
          type="button"
          className={premium ? styles.rivalOn : styles.rival}
          aria-pressed={rival}
          onClick={() => {
            if (!premium) return premiumOnly(t("actions.rivalFeature"));
            setRival(!rival);
            setNotice(rival ? null : t("actions.rivaled"));
          }}
        >
          {rival ? t("actions.unrival") : t("actions.rival")}
        </button>
      </div>
      {notice && <p className={styles.notice} role="status">{notice}</p>}
    </article>
  );
}

/** The white inner card: icon, title pill, name, rating plate, then dan, class and stars. */
export function NetFriendFace({ avatar, title, name, rating, ratingText, plateLabel, dan, classRank, stars }: {
  avatar: ReactNode;
  title: string;
  name: string;
  rating: number;
  /** Shown on the plate instead of `rating`, which then only picks the plate color. */
  ratingText?: string;
  plateLabel: string;
  dan: string;
  classRank: string;
  stars: string;
}) {
  return (
    <div className={styles.face}>
      <div className={styles.avatar}>{avatar}</div>
      <div className={styles.faceBody}>
        <div className={styles.trophy}>{title}</div>
        <div className={styles.nameRow}>
          <div className={styles.name}>{name}</div>
          <NetRatingPlate rating={rating} label={plateLabel} text={ratingText ?? undefined} />
        </div>
        <div className={styles.badges}>
          <span className={styles.dan}>{dan}</span>
          <span className={styles.classRank}>{classRank}</span>
          <span className={styles.stars}><NetStarArt size={20} />×{stars}</span>
        </div>
      </div>
    </div>
  );
}
