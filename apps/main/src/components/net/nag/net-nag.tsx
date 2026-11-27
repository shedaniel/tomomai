"use client";

import { useEffect, useState } from "react";
import { M_PLUS_Rounded_1c, Mochiy_Pop_One } from "next/font/google";
import { Link } from "@/i18n/navigation";
import { netBasePath } from "@/lib/net/routes";
import styles from "./net-nag.module.css";

const mochiy = Mochiy_Pop_One({ weight: "400", subsets: ["latin"], variable: "--net-font-pop", display: "swap", preload: false });
const rounded = M_PLUS_Rounded_1c({ weight: ["500", "700"], subsets: ["latin"], variable: "--net-font-jp", display: "swap", preload: false });

/** The invite to tomomai NET, dressed like one of its own popups. Shown on every visit, dismissing it only closes it for that page view. */
export function NetNag({ username, region }: { username: string; region: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setOpen(true), 900);
    return () => window.clearTimeout(timer);
  }, []);

  const close = () => setOpen(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;
  return (
    <div className={`${styles.backdrop} ${mochiy.variable} ${rounded.variable}`} onClick={close}>
      <div className={styles.card} role="dialog" aria-modal="true" aria-labelledby="net-nag-title" onClick={event => event.stopPropagation()}>
        <div className={styles.head}>
          <span className={styles.tag}>NEW</span>
          <div className={styles.logo}>tomo<b>mai</b><i>NET</i><sup>TM</sup></div>
          <h2 id="net-nag-title" className={styles.title}>Introducing the SUPERIOR NET</h2>
        </div>
        <div className={styles.body}>
          <p>Your plays, your rating and your records, rebuilt from the ground up. Faster, friendlier and miles ahead of the other NET.</p>
          <p className={styles.accent}>Finally, a NET worth logging in to.</p>
          <ul className={styles.list}>
            <li>Every record, with a full detail page</li>
            <li>Friends, rankings and a proper rating plate</li>
            <li>Secrets hidden throughout, if you look closely</li>
          </ul>
          <Link href={netBasePath(username, region)} className={styles.go} onClick={close}>TRY THE SUPERIOR NET</Link>
          <button type="button" className={styles.later} onClick={close}>Maybe later</button>
          <div className={styles.foot}>Included free with your tomomai account.</div>
        </div>
      </div>
    </div>
  );
}
