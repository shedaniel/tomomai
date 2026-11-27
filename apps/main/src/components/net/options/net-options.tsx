"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { NetButton, NetPanel, NetSelect } from "../kit";
import { findNetEgg } from "../eggs/eggs";
import { NetLockArt } from "../net-art";
import { useNetTier } from "../premium/tier";
import styles from "./options.module.css";

const STORAGE_KEY = "tomomai-net-options";
const CHANGE_EVENT = "tomomai-net-options-change";

type Choice = { value: string; label?: string };
type Field = { id: string; choices: readonly Choice[]; fallback: string; premium?: boolean };

const raw = (values: readonly string[]): Choice[] => values.map(value => ({ value }));
const keyed = (keys: readonly string[]): Choice[] => keys.map(key => ({ value: key, label: key }));
const steps = (from: number, to: number, step: number, digits: number, signed = false) =>
  raw(Array.from({ length: Math.round((to - from) / step) + 1 }, (_, index) => {
    const value = from + index * step;
    return `${signed && value > 0 ? "+" : ""}${value.toFixed(digits)}`;
  }));

const GROUPS: readonly { id: string; premium?: boolean; fields: readonly Field[] }[] = [
  { id: "speed", fields: [
    { id: "noteSpeed", choices: steps(1, 10, 0.25, 2), fallback: "6.50" },
    { id: "touchSpeed", choices: steps(1, 10, 0.25, 2), fallback: "6.50" },
    { id: "slideSpeed", choices: steps(-1, 1, 0.5, 1, true), fallback: "0.0" },
  ] },
  { id: "judge", fields: [
    { id: "judgeTiming", choices: steps(-2, 2, 0.5, 1, true), fallback: "0.0" },
    { id: "judgeDisplay", choices: keyed(["critical", "perfect", "everything", "off"]), fallback: "critical" },
    { id: "mirror", choices: keyed(["off", "lr", "ud", "rotate", "spin"]), fallback: "off" },
  ] },
  { id: "sound", fields: [
    { id: "bgmVolume", choices: raw(Array.from({ length: 11 }, (_, index) => String(index))), fallback: "8" },
    { id: "answerSound", choices: keyed(["off", "chime", "ding", "bonk"]), fallback: "chime" },
    { id: "breakSe", choices: keyed(["on", "off"]), fallback: "on" },
  ] },
  { id: "display", fields: [
    { id: "centerDisplay", choices: keyed(["achievement", "achievementRounded", "dxScore", "combo", "none"]), fallback: "achievement" },
    { id: "trackSkip", choices: keyed(["off", "manual", "always"]), fallback: "off" },
  ] },
  { id: "premium", premium: true, fields: [
    { id: "lagFix", choices: keyed(["off", "auto"]), fallback: "off", premium: true },
    { id: "wristGuard", choices: keyed(["off", "gentle", "maximum"]), fallback: "off", premium: true },
    { id: "skipMaintenance", choices: keyed(["off", "on"]), fallback: "off", premium: true },
  ] },
];

const LOGOUT_PRESSES = 5;

function spinColumn(from: Element | null) {
  const column = from?.closest("main")?.parentElement;
  if (!column || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  column.animate(
    [
      { transform: "rotate(0deg) translateX(0)", easing: "ease-in" },
      { transform: "rotate(720deg) translateX(-6px)", offset: 0.3 },
      { transform: "rotate(1800deg) translateX(6px)", offset: 0.75 },
      { transform: "rotate(2160deg) translateX(0)", easing: "ease-out" },
    ],
    { duration: 2800 },
  );
}

const FIELDS = GROUPS.flatMap(group => group.fields);
const NUMERIC = ["noteSpeed", "touchSpeed", "slideSpeed", "judgeTiming", "bgmVolume"];
const SILENT: Readonly<Record<string, string>> = { bgmVolume: "0", answerSound: "off", breakSe: "off" };

function isMaxed(values: Record<string, string>) {
  return FIELDS.filter(field => NUMERIC.includes(field.id)).every(field => values[field.id] === field.choices.at(-1)?.value);
}

function isMuted(values: Record<string, string>) {
  return Object.entries(SILENT).every(([id, value]) => values[id] === value);
}

const DEFAULTS: Readonly<Record<string, string>> = Object.fromEntries(GROUPS.flatMap(group => group.fields.map(field => [field.id, field.fallback])));

function readStored(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStored(value: Record<string, string> | null) {
  try {
    if (value) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Blocked storage only means the options are forgotten on reload, which matches the joke anyway.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function parse(stored: string | null): Record<string, string> {
  if (!stored) return {};
  try {
    const value: unknown = JSON.parse(stored);
    if (!value || typeof value !== "object") return {};
    return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[0] in DEFAULTS));
  } catch {
    return {};
  }
}

/** DX NET's settings menu plus its option sheet. Saved in this browser, applied nowhere. */
export function NetOptions() {
  const t = useTranslations("net.options");
  const premium = useNetTier() === "premium";
  const stored = useSyncExternalStore(subscribe, readStored, () => null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [menuStatus, setMenuStatus] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [secret, setSecret] = useState(false);
  const values = { ...DEFAULTS, ...parse(stored), ...draft };
  const logoutRef = useRef<HTMLDivElement>(null);
  const [logoutPresses, setLogoutPresses] = useState(0);

  useEffect(() => {
    const reset = (event: PointerEvent) => {
      if (!logoutRef.current?.contains(event.target as Node)) setLogoutPresses(0);
    };
    document.addEventListener("pointerdown", reset);
    return () => document.removeEventListener("pointerdown", reset);
  }, []);

  const logout = () => {
    const next = logoutPresses + 1;
    setLogoutPresses(next);
    setMenuStatus(t(`menu.logoutPresses.${Math.min(next, LOGOUT_PRESSES)}`));
    if (next >= LOGOUT_PRESSES) findNetEgg("logoutSpam");
  };

  const save = () => {
    writeStored(values);
    setDraft({});
    if (values.mirror === "spin" && values.answerSound === "bonk") {
      setSecret(true);
      setStatus(t("spun"));
      spinColumn(document.getElementById("net-options"));
      findNetEgg("optionsSpin");
      return;
    }
    const egg = isMaxed(values) ? "optionsMaxed" : isMuted(values) ? "optionsMute" : null;
    setSecret(!!egg);
    setStatus(egg === "optionsMaxed" ? t("maxed") : egg === "optionsMute" ? t("muted") : t("saved"));
    if (egg) findNetEgg(egg);
  };
  const reset = () => {
    writeStored(null);
    setDraft({});
    setSecret(false);
    setStatus(t("resetDone"));
  };

  return (
    <>
      <NetPanel>
        <ul className={styles.menu}>
          {(["playerName", "favorites", "friendSkip"] as const).map(id => (
            <li key={id} className={styles.menuRow}>
              <span>{t(`menu.${id}`)}</span>
              <NetButton tone="orange" onClick={() => setMenuStatus(t("menu.changeMissing"))}>{t("menu.change")}</NetButton>
            </li>
          ))}
          <li className={styles.menuRow}>
            <span>{t("menu.option")}</span>
            <NetButton tone="orange" onClick={() => document.getElementById("net-options")?.scrollIntoView()}>{t("menu.change")}</NetButton>
          </li>
        </ul>
        <div className={styles.logout} ref={logoutRef}><NetButton onClick={logout}>{t("menu.logout")}</NetButton></div>
        {menuStatus && <div className={styles.status} role="status">{menuStatus}</div>}
      </NetPanel>

      <NetPanel heading={t("heading")}>
        <form id="net-options" onSubmit={event => { event.preventDefault(); save(); }}>
          {GROUPS.map(group => (
            <div key={group.id}>
              <div className={cn(styles.group, group.premium && styles.groupPremium)}>{t(`groups.${group.id}`)}</div>
              {group.fields.map(field => {
                const locked = field.premium && !premium;
                return (
                  <div key={field.id} className={cn(styles.field, locked && styles.locked)}>
                    <label className={styles.fieldLabel} htmlFor={`net-option-${field.id}`}>
                      {t(`fields.${field.id}`)}
                      {field.premium && <span className={styles.badge}>{locked && <NetLockArt size={11} />}{t("premiumBadge")}</span>}
                    </label>
                    <NetSelect
                      id={`net-option-${field.id}`}
                      className={styles.select}
                      value={values[field.id]}
                      disabled={locked}
                      onChange={event => {
                        const value = event.target.value;
                        setDraft(current => ({ ...current, [field.id]: value }));
                        setStatus(null);
                      }}
                    >
                      {field.choices.map(choice => (
                        <option key={choice.value} value={choice.value}>{choice.label ? t(`values.${choice.label}`) : choice.value}</option>
                      ))}
                    </NetSelect>
                  </div>
                );
              })}
              {group.premium && !premium && <div className={styles.lockedNote}>{t("premiumLocked")}</div>}
            </div>
          ))}
          <div className={styles.actions}>
            <NetButton type="submit" tone="orange">{t("save")}</NetButton>
            <NetButton onClick={reset}>{t("reset")}</NetButton>
          </div>
          {status && <div className={cn(styles.status, secret && styles.statusSecret)} role="status">{status}</div>}
        </form>
      </NetPanel>
    </>
  );
}
