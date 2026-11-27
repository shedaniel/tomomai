"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { findNetEgg } from "../eggs/eggs";
import { NetStarArt } from "../net-art";
import { NetFriendFace } from "./net-friend-card";
import { NetKotoneAvatar } from "./net-special-avatars";
import styles from "./friends.module.css";

/** A first-year idol who turns up when someone keeps poking the first star on their player card. The player scouts her. */
export function NetKotoneScout({ onClose }: { onClose: () => void }) {
  const t = useTranslations("net.friends");
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className={styles.scoutBackdrop} onClick={onClose}>
      <article className={styles.scoutSheet} role="dialog" aria-modal="true" aria-label={t("kotone.heading")} onClick={event => event.stopPropagation()}>
        <NetStarArt size={34} className={styles.corner} />
        <NetFriendFace
          avatar={<NetKotoneAvatar />}
          title={t("kotone.title")}
          name={t("kotone.name")}
          rating={14500}
          plateLabel={t("plateLabel")}
          dan={t("kotone.dan")}
          classRank={t("kotone.classRank")}
          stars={t("kotone.stars")}
        />
        <div className={styles.comment}>{t("kotone.comment")}</div>
        <div className={styles.specialAdd}>
          <button
            type="button"
            disabled={accepted}
            onClick={() => {
              setAccepted(true);
              findNetEgg("gakumas");
            }}
          >
            {t("kotone.accept")}
          </button>
          <button type="button" onClick={onClose}>{t("kotone.close")}</button>
        </div>
        {accepted && <p className={styles.notice} role="status">{t("kotone.accepted")}</p>}
      </article>
    </div>
  );
}
