"use client";

import { openNetAime } from "../eggs/global-dialog";
import styles from "./friends.module.css";

export function NetAimeNote({ note, link }: { note: string; link: string }) {
  return (
    <p className={styles.requestsNote}>
      {note}
      <button type="button" className={styles.aimeNote} onClick={openNetAime}>{link}</button>
    </p>
  );
}
