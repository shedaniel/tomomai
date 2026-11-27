"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { NetButton, NetButtonLink, NetPanel, NetTitle } from "../kit";
import { useNetBase } from "../eggs/use-net-base";
import { findNetEgg } from "../eggs/eggs";
import { cn } from "@/lib/utils";
import styles from "./hidden.module.css";

const LOGINS_NEEDED = 3;
const ERROR_RETURN_MS = 700;
const DELETES_FOR_ROLL = 3;

/** The staff door. The password is "password", and it has to be typed in three times. */
export function NetStaffDoor() {
  const t = useTranslations("net.home.hidden.admin");
  const [logins, setLogins] = useState(0);
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const submit = () => {
    if (password !== "password") {
      setMessage(t("wrong"));
      setPassword("");
      return;
    }
    const next = logins + 1;
    setLogins(next);
    setUser("");
    setPassword("");
    if (next >= LOGINS_NEEDED) {
      setMessage(null);
      findNetEgg("admin");
      return;
    }
    setMessage(t(next === 1 ? "correct1" : "correct2"));
  };

  if (logins >= LOGINS_NEEDED) {
    return <NetStaffPanel onLogout={() => { setLogins(0); setMessage(t("loggedOut")); }} />;
  }

  return (
    <>
      <div className={styles.door}>
        <div className={styles.doorSign}>{t("door")}</div>
        <p className={styles.doorNote}>{t("doorNote")}</p>
      </div>
      <NetTitle>{t("title")}</NetTitle>
      <NetPanel>
        <form className={styles.form} onSubmit={event => { event.preventDefault(); submit(); passwordRef.current?.focus(); }}>
          <label className={styles.field}>
            {t("user")}
            <input className={styles.input} value={user} onChange={event => setUser(event.target.value)} autoComplete="off" />
          </label>
          <label className={styles.field}>
            {t("password")}
            <input
              ref={passwordRef}
              className={styles.input}
              type="password"
              value={password}
              onChange={event => setPassword(event.target.value)}
              autoComplete="off"
            />
          </label>
          <div className={styles.actions}><NetButton type="submit" tone="orange">{t("submit")}</NetButton></div>
        </form>
        {message && <p className={styles.result} role="status">{message}</p>}
      </NetPanel>
    </>
  );
}

function NetStaffPanel({ onLogout }: { onLogout: () => void }) {
  const t = useTranslations("net.home.hidden.admin");
  const base = useNetBase();
  const [sssDenied, setSssDenied] = useState(false);
  const [errorPresent, setErrorPresent] = useState(true);
  const [deleted, setDeleted] = useState(0);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const deleteError = () => {
    setErrorPresent(false);
    setDeleted(count => count + 1);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setErrorPresent(true), ERROR_RETURN_MS);
  };

  const stats = ["cabinets", "queue", "gloves"] as const;

  return (
    <>
      <NetTitle>{t("dashboard")}</NetTitle>
      <NetPanel>
        <p className={styles.body}>{t("welcome")}</p>
        <div className={styles.stats}>
          {stats.map(key => (
            <div key={key} className={styles.stat}><span>{t(`stats.${key}`)}</span><b>{t(`stats.${key}Value`)}</b></div>
          ))}
        </div>
        <div className={styles.tools}>
          <div className={styles.tool}>
            <NetButton disabled aria-disabled className={styles.disabled}>{t("fixButton")}</NetButton>
            <span className={styles.toolNote}>{t("fixButtonNote")}</span>
          </div>
          <div className={styles.tool}>
            <NetButton onClick={() => setSssDenied(true)}>{t("sss")}</NetButton>
            {sssDenied && <span className={styles.toolNote} role="status">{t("sssDenied")}</span>}
          </div>
          <div className={styles.tool}>
            <NetButton tone="orange" onClick={deleteError} disabled={!errorPresent}>{t("deleteError")}</NetButton>
          </div>
        </div>
        <div className={styles.errorList}>
          <h5>{t("errorsTitle")}</h5>
          {errorPresent
            ? <div key={deleted} className={cn(styles.errorItem, deleted > 0 && styles.pop)}>{t("errorRow")}</div>
            : <div className={styles.stat}>{t("noErrors")}</div>}
          {errorPresent && deleted > 0 && <p className={styles.result} role="status">{t("errorBack", { count: deleted })}</p>}
        </div>
        {deleted >= DELETES_FOR_ROLL && (
          <div className={styles.errorList}>
            <p className={styles.result} role="status">{t("rollNote")}</p>
            <div className={styles.actions}><NetButtonLink href={`${base}/credits`} tone="orange">{t("rollCredits")}</NetButtonLink></div>
          </div>
        )}
        <div className={styles.actions}><NetButton onClick={onLogout}>{t("logout")}</NetButton></div>
      </NetPanel>
    </>
  );
}
