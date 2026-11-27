"use client";

import type { ReactNode } from "react";
import styles from "./home.module.css";

const LOGIN_KEYS = ["l", "o", "g", "i", "n"];

/** The comment box's "Please log in again." Tapping it plays the login keys, same as typing them. */
export function NetLoginLink({ children }: { children: ReactNode }) {
  const press = () => {
    for (const key of LOGIN_KEYS) document.body.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  };
  return <button type="button" className={styles.loginLink} onClick={press}>{children}</button>;
}
