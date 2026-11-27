"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import styles from "./friends.module.css";

/** Copies `text` and says so on the button for a moment. */
export function NetCopyButton({ text, children, className }: { text: string; children: ReactNode; className?: string }) {
  const t = useTranslations("net.friends.list");
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={className ?? styles.copy}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        } catch {
          // Clipboard can be blocked. The code is on screen to copy by hand.
        }
      }}
    >
      {copied ? t("copied") : children}
    </button>
  );
}

/** DX NET's "Your FRIEND CODE" tab, which opens the code with a copy button. */
export function NetFriendCodeButton({ code }: { code: string }) {
  const t = useTranslations("net.friends.list");
  const [open, setOpen] = useState(false);
  return (
    <div className={styles.codeWrap}>
      <button type="button" className={styles.codeTab} aria-expanded={open} onClick={() => setOpen(!open)}>
        {t("yourCode")}
      </button>
      {open && (
        <div className={styles.codeBox}>
          <div className={styles.code}>{code}</div>
          <NetCopyButton text={code}>{t("copy")}</NetCopyButton>
          <p>{t("codeNote")}</p>
        </div>
      )}
    </div>
  );
}
