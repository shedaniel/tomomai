"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { findNetEgg } from "../eggs/eggs";
import { NetButton, NetButtonLink } from "../kit";
import { cancelNetTier, purchaseNetTier, setNetDarkMode, useNetDarkMode, useNetTier, type NetTier } from "../premium/tier";
import styles from "./shop.module.css";

const COURSES = [
  { id: "light", features: ["f1", "f2", "f3"], tier: "free" },
  { id: "standard", features: ["f1", "f2", "f3", "f4"], tier: "standard" },
  { id: "premium", features: ["f1", "f2", "f3"], tier: "premium" },
] as const satisfies readonly { id: string; features: readonly string[]; tier: NetTier }[];

const CANCEL_STEPS = 3;
const FREE_CANCEL_CHOICES = ["other", "outside", "nextDoor"] as const;
type FreeCancelChoice = (typeof FREE_CANCEL_CHOICES)[number];
type FreeCancelStep = "idle" | "ask" | { choice: FreeCancelChoice } | "done";

function FreeCancel() {
  const t = useTranslations("net.shop.cancelFree");
  const [step, setStep] = useState<FreeCancelStep>("idle");

  if (step === "idle") {
    return <div><button type="button" className={styles.again} onClick={() => setStep("ask")}>{t("start")}</button></div>;
  }
  if (step === "done") {
    return (
      <div className={styles.freeCancel} role="status">
        <p className={styles.freeCancelTitle}>{t("doneTitle")}</p>
        <p>{t("doneBody")}</p>
        <div className={styles.freeActions}><NetButton onClick={() => setStep("idle")}>{t("close")}</NetButton></div>
      </div>
    );
  }
  return (
    <div className={styles.freeCancel} role="status">
      {step === "ask" ? (
        <>
          <p className={styles.cancelAsk}>{t("ask")}</p>
          <div className={styles.freeActions}>
            {FREE_CANCEL_CHOICES.map(choice => (
              <button key={choice} type="button" className={styles.choice} onClick={() => setStep({ choice })}>{t(`choices.${choice}`)}</button>
            ))}
          </div>
        </>
      ) : (
        <>
          <p>{t(`replies.${step.choice}`)}</p>
          <p className={styles.cancelAsk}>{t("confirmAsk")}</p>
          <div className={styles.freeActions}>
            <NetButton onClick={() => setStep("idle")}>{t("keep")}</NetButton>
            <button
              type="button"
              className={styles.again}
              onClick={() => {
                setStep("done");
                findNetEgg("shopCancelFree");
              }}
            >
              {t("confirm")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/** The course tiers. Subscribing "buys" a course in this browser only, charges nothing and throws confetti. */
export function NetCourses({ homePath, profilePath }: { homePath: string; profilePath: string }) {
  const t = useTranslations("net.shop");
  const tier = useNetTier();
  const dark = useNetDarkMode();
  const [cancelStep, setCancelStep] = useState(0);
  const [cancelled, setCancelled] = useState(false);

  return (
    <>
      {tier !== "free" && (
        <div className={styles.free} role="status">
          <h4>{t(`member.${tier}.title`)}</h4>
          <p className={styles.freeBody}>{t(`member.${tier}.body`)}</p>
          {tier === "premium" && (
            <div className={styles.freeActions}>
              <NetButton tone={dark ? "blue" : "orange"} onClick={() => setNetDarkMode(!dark)}>{t(dark ? "member.darkOff" : "member.darkOn")}</NetButton>
            </div>
          )}
          {cancelStep > 0 && <p className={styles.cancelAsk}>{t(`cancel.step${cancelStep}`)}</p>}
          <div className={styles.freeActions}>
            {cancelStep > 0 && <NetButton onClick={() => setCancelStep(0)}>{t("cancel.keep")}</NetButton>}
            <button
              type="button"
              className={styles.again}
              onClick={() => {
                if (cancelStep < CANCEL_STEPS) return setCancelStep(cancelStep + 1);
                cancelNetTier();
                setCancelStep(0);
                setCancelled(true);
              }}
            >
              {t(cancelStep === 0 ? "cancel.start" : "cancel.confirm")}
            </button>
          </div>
        </div>
      )}
      {cancelled && tier === "free" && (
        <div className={styles.free} role="status">
          <h4>{t("cancel.doneTitle")}</h4>
          <p>{t("cancel.doneBody")}</p>
        </div>
      )}
      <div className={styles.courses}>
        {COURSES.map(course => {
          const current = course.tier === tier;
          return (
            <section key={course.id} className={cn(styles.course, styles[course.id], current && styles.current)}>
              {current ? <span className={cn(styles.ribbon, styles.ribbonCurrent)}>{t("current")}</span>
                : course.id === "standard" && <span className={styles.ribbon}>{t("recommended")}</span>}
              <h4 className={styles.courseName}>{t(`courses.${course.id}.name`)}</h4>
              <div className={styles.price}>
                {t(`courses.${course.id}.price`)}
                {course.tier !== "free" && <small>{t("perMonth")}</small>}
              </div>
              <p className={styles.lead}>{t(`courses.${course.id}.lead`)}</p>
              <ul className={styles.features}>
                {course.features.map(feature => <li key={feature}>{t(`courses.${course.id}.${feature}`)}</li>)}
              </ul>
              <div className={styles.action}>
                {course.tier === "free" ? (
                  <>
                    <NetButtonLink href={profilePath}>{t(`courses.${course.id}.action`)}</NetButtonLink>
                    {current && <FreeCancel />}
                  </>
                ) : current ? (
                  <NetButtonLink href={homePath}>{t("enjoy")}</NetButtonLink>
                ) : (
                  <NetButton tone="orange" onClick={() => { setCancelled(false); purchaseNetTier(course.tier); }}>
                    {t(tier === "premium" && course.tier === "standard" ? "downgrade" : `courses.${course.id}.action`)}
                  </NetButton>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
