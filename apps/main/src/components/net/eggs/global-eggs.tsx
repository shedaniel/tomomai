"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { NetButton } from "../kit";
import { findNetEgg, listenForSequence } from "./eggs";
import { NetEggAttract } from "./global-attract";
import { NetEggBackdrop, NetEggBanner, NetEggDialogCard, onNetAimeOpen } from "./global-dialog";
import { NetEggSlide } from "./global-slide";
import styles from "./global.module.css";
import trails from "./trails.module.css";

const KONAMI = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"];
const UTAGE_SECONDS = 15;
const AWAY_MS = 5000;
const AIME_STEPS = 5;

/** The secrets that live on every /net page and need no particular element. */
export function NetGlobalEggs() {
  return (
    <>
      <UtageMode />
      <AimeReader />
      <LoginLoop />
      <ConsoleAd />
      <NetEggAttract />
      <NetEggSlide />
      <DateBanners />
      <TabAway />
    </>
  );
}

function UtageMode() {
  const t = useTranslations("net.common.eggs.utage");
  const [phase, setPhase] = useState<"off" | "intro" | "on">("off");
  const [left, setLeft] = useState(UTAGE_SECONDS);

  useEffect(() => listenForSequence(KONAMI, () => setPhase(current => (current === "off" ? "intro" : current))), []);

  useEffect(() => {
    if (phase !== "intro") return;
    const timer = window.setTimeout(() => {
      setLeft(UTAGE_SECONDS);
      setPhase("on");
      findNetEgg("konami");
    }, 2600);
    return () => window.clearTimeout(timer);
  }, [phase]);

  useEffect(() => {
    if (phase !== "on") return;
    const root = document.documentElement;
    root.dataset.netUtage = "";
    const tick = window.setInterval(() => {
      setLeft(current => {
        if (current <= 1) setPhase("off");
        return current - 1;
      });
    }, 1000);
    return () => {
      window.clearInterval(tick);
      delete root.dataset.netUtage;
    };
  }, [phase]);

  if (phase === "intro") {
    return (
      <div className={styles.intro} role="status">
        <div className={styles.introTitle}>{t("intro")}</div>
        <div className={styles.introSub}>{t("introSub")}</div>
      </div>
    );
  }
  if (phase !== "on") return null;
  return (
    <>
      <div className={styles.utage} role="status">
        <span className={styles.utageStamp} aria-hidden>{t("stamp")}</span>
        <div>
          <div className={styles.utageTitle}>{t("title")}</div>
          <div className={styles.utageBody}>{t("body")}</div>
          <div className={trails.utageCode}>{t("code")}</div>
        </div>
        <span className={styles.utageLeft}>{t("left", { seconds: Math.max(left, 0) })}</span>
      </div>
      <div className={styles.utageBig} aria-hidden>{t("stamp")}</div>
    </>
  );
}

function AimeReader() {
  const t = useTranslations("net.common.eggs.aime");
  const [step, setStep] = useState<number | null>(null);

  useEffect(() => {
    const open = () => setStep(current => current ?? 0);
    const stop = listenForSequence(["a", "i", "m", "e"], open);
    const stopNote = onNetAimeOpen(open);
    return () => { stop(); stopNote(); };
  }, []);

  if (step === null) return null;
  const done = step >= AIME_STEPS;
  const touch = () => {
    const next = step + 1;
    setStep(next);
    if (next >= AIME_STEPS) findNetEgg("typeAime");
  };

  return (
    <NetEggBackdrop>
      <NetEggDialogCard
        title={done ? t("doneTitle") : t("title")}
        tone={done ? "yellow" : "blue"}
        actions={done
          ? <NetButton onClick={() => setStep(null)}>{t("ok")}</NetButton>
          : <NetButton tone="orange" onClick={touch}>{t("touch")}</NetButton>}
      >
        <div key={step} className={cn(styles.reader, step > 0 && !done && styles.readerShake)}>
          <div className={cn(styles.readerLight, step > 0 && !done && styles.readerLightRed, done && styles.readerLightGreen)} />
        </div>
        <div role="status">{done ? t("doneBody") : t(`steps.${step}`)}</div>
      </NetEggDialogCard>
    </NetEggBackdrop>
  );
}

const LOGIN_DEPTH = 3;

function LoginLoop() {
  const t = useTranslations("net.common.eggs.login");
  const [depth, setDepth] = useState(0);

  useEffect(() => listenForSequence(["l", "o", "g", "i", "n"], () => setDepth(current => current || 1)), []);

  if (depth === 0) return null;
  const done = depth > LOGIN_DEPTH;
  const bodies = ["body", "bodyDeeper", "bodyDeepest"] as const;
  const logIn = () => {
    const next = depth + 1;
    setDepth(next);
    if (next > LOGIN_DEPTH) findNetEgg("typeLogin");
  };

  return (
    <NetEggBackdrop>
      {done ? (
        <NetEggDialogCard title={t("doneTitle")} tone="yellow" actions={<NetButton onClick={() => setDepth(0)}>{t("ok")}</NetButton>}>
          {t("doneBody")}
        </NetEggDialogCard>
      ) : (
        Array.from({ length: depth }, (_, i) => (
          <div key={i} className={styles.stacked} style={{ translate: `${(i - (depth - 1) / 2) * 22}px ${(i - (depth - 1) / 2) * 34}px` }}>
            <NetEggDialogCard
              title={t("title")}
              tone="pink"
              actions={i === depth - 1 ? <NetButton tone="orange" onClick={logIn}>{t("button")}</NetButton> : <NetButton disabled>{t("button")}</NetButton>}
            >
              {t(bodies[i])}
            </NetEggDialogCard>
          </div>
        ))
      )}
    </NetEggBackdrop>
  );
}

type ConsoleWindow = Window & { tomomaiNET?: { apply(): string } };
let consoleAnnounced = false;

function ConsoleAd() {
  const t = useTranslations("net.common.eggs.console");

  useEffect(() => {
    const target = window as ConsoleWindow;
    target.tomomaiNET = {
      apply() {
        console.log(`%c${t("rejection")}`, "font: 13px/1.6 monospace; color: #1d2b6b; background: #fff6c8; padding: 10px 14px; border: 2px solid #1d2b6b;");
        findNetEgg("console");
        return t("applied");
      },
    };
    if (!consoleAnnounced) {
      consoleAnnounced = true;
      console.log(
        `%c${t("banner")}%c ${t("tagline")}\n\n%c${t("hiring")}`,
        "font: 700 28px sans-serif; color: #fff; background: #51bcf3; padding: 6px 14px; border: 3px solid #1d2b6b; border-radius: 6px; text-shadow: 2px 2px 0 #1d2b6b;",
        "font: 600 13px sans-serif; color: #ff3f6c;",
        "font: 600 13px sans-serif; color: #1d2b6b;",
      );
    }
    return () => { delete target.tomomaiNET; };
  }, [t]);

  return null;
}

function jstNow() {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return { hour: now.getUTCHours(), month: now.getUTCMonth(), date: now.getUTCDate() };
}

function DateBanners() {
  const t = useTranslations("net.common.eggs");
  const [maintenance, setMaintenance] = useState(false);
  const [aprilFools, setAprilFools] = useState(false);

  useEffect(() => {
    const { hour, month, date } = jstNow();
    const timer = window.setTimeout(() => {
      if (hour >= 4 && hour < 7) {
        setMaintenance(true);
        findNetEgg("maintenance");
      }
      if (month === 3 && date === 1) {
        setAprilFools(true);
        findNetEgg("aprilFools");
      }
    }, 1200);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <>
      {maintenance && (
        <NetEggBanner tag={t("maintenance.title")} tone="red" close={t("maintenance.close")} onClose={() => setMaintenance(false)}>
          {t("maintenance.body")}
        </NetEggBanner>
      )}
      {aprilFools && (
        <NetEggBanner tag={t("aprilFools.title")} tone="pink" close={t("aprilFools.close")} onClose={() => setAprilFools(false)}>
          {t("aprilFools.body")}
        </NetEggBanner>
      )}
    </>
  );
}

function TabAway() {
  const t = useTranslations("net.common.eggs.tabAway");
  const [back, setBack] = useState(false);

  useEffect(() => {
    let leftAt = 0;
    let savedTitle = "";
    const awayTitle = t("title");
    const onChange = () => {
      if (document.visibilityState === "hidden") {
        leftAt = Date.now();
        savedTitle = document.title;
        document.title = awayTitle;
        return;
      }
      if (document.title === awayTitle) document.title = savedTitle;
      if (leftAt && Date.now() - leftAt > AWAY_MS) {
        setBack(true);
        findNetEgg("tabAway");
      }
      leftAt = 0;
    };
    document.addEventListener("visibilitychange", onChange);
    return () => {
      document.removeEventListener("visibilitychange", onChange);
      if (document.title === awayTitle) document.title = savedTitle;
    };
  }, [t]);

  if (!back) return null;
  return (
    <NetEggBanner tag={t("tag")} close={t("close")} onClose={() => setBack(false)}>
      {t("toast")}
    </NetEggBanner>
  );
}
