"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { findNetEgg, type NetEggId } from "../eggs/eggs";
import { NetStarArt } from "../net-art";
import { NetAiMascot } from "./net-ai-mascot";
import { NET_AI_RATING, NetFriendFace } from "./net-friend-card";
import { NetSpecialAvatar, type NetSpecialFriend } from "./net-special-avatars";
import styles from "./friends.module.css";

type Plain = "empty" | "invalid" | "letters" | "notFound" | "found";
type Result = Plain | NetSpecialFriend;

const EGG_IDS: Partial<Readonly<Record<NetSpecialFriend, NetEggId>>> = {
  mirror: "friendMirror",
  self: "friendSelf",
  error: "friendError",
  nobody: "friendNobody",
};

const PI_DIGITS = "3141592653589793238462643";
const EMPTY_TRIES_FOR_NOBODY = 3;

/** Groups a typed friend code in fours so the digit count is easy to see. Anything with letters is left alone. */
function formatCode(input: string): string {
  if (!/^[\d\s\-.]*$/.test(input)) return input;
  const digits = input.replace(/\D/g, "").slice(0, 20);
  return digits.replace(/(\d{4})(?=\d)/g, "$1 ");
}

/** A keypad word or date, with any number of zeros around it, as long as it still fits a 13-digit code. */
const padded = (core: string) => new RegExp(`^0*${core}0*$`);

const PATTERNS: readonly (readonly [RegExp, NetSpecialFriend])[] = [
  [/^0+$/, "nobody"],
  [/^7{13}$/, "jackpot"],
  [/^(39){3,}3?$/, "miku"],
  [padded("7342"), "sega"],
  [padded("624624"), "washer"],
  [padded("20270401"), "future"],
  [padded("100001"), "error"],
];

function special(code: string): NetSpecialFriend | null {
  if (code.length > 13) return null;
  if (code.length >= 6 && PI_DIGITS.startsWith(code)) return "pi";
  return PATTERNS.find(([pattern]) => pattern.test(code))?.[1] ?? null;
}

/** Half the codes in the world belong to tomomai AI. The other half need you to log in again. */
function lookup(input: string, ownCode: string): Result {
  const code = input.replace(/[\s\-.]/g, "");
  if (!code) return "empty";
  if (/^[a-z]+$/i.test(code)) return "letters";
  const secret = special(code);
  if (secret) return secret;
  if (!/^\d{13}$/.test(code)) return "invalid";
  if (code === ownCode) return "self";
  if (code === [...ownCode].reverse().join("")) return "mirror";
  return Number(code.at(-1)) % 2 === 0 ? "notFound" : "found";
}

const isSpecial = (result: Result | null): result is NetSpecialFriend => !!result && result in EGG_IDS;

function reverseDigits(value: number) {
  return Number([...String(value)].reverse().join(""));
}

const REEL_SYMBOLS = ["3", "9", "1", "5", "2", "8", "4", "6", "0", "3", "9", "5", "7"];
const REEL_TIMES = [1100, 1500, 1900];

function NetJackpotReels({ spinning, onDone }: { spinning: boolean; onDone: () => void }) {
  const t = useTranslations("net.friends.special");
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });
  useEffect(() => {
    if (!spinning) return;
    let reduce = false;
    try {
      reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      // Older browsers spin anyway.
    }
    const timer = window.setTimeout(() => done.current(), reduce ? 300 : REEL_TIMES.at(-1)! + 200);
    return () => window.clearTimeout(timer);
  }, [spinning]);

  return (
    <div className={styles.reels}>
      <div className={styles.reelRow} aria-hidden>
        {REEL_TIMES.map(time => (
          <div key={time} className={styles.reel}>
            <div className={styles.reelStrip} style={{ "--reel-time": `${time}ms` } as CSSProperties}>
              {REEL_SYMBOLS.map((symbol, index) => <span key={index}>{symbol}</span>)}
            </div>
          </div>
        ))}
      </div>
      <div className={styles.reelCaption} role="status">{spinning ? t("jackpotSpin") : t("jackpotWin")}</div>
    </div>
  );
}

function NetSpecialCard({ kind, ownName, ownRating }: { kind: NetSpecialFriend; ownName: string; ownRating: number | null }) {
  const t = useTranslations("net.friends");
  const [added, setAdded] = useState(false);
  const key = `special.${kind}` as const;
  const ratings: Record<NetSpecialFriend, [number, string]> = {
    sega: [NET_AI_RATING, "∞"],
    miku: [3939, "3939"],
    pi: [3, "3.14159..."],
    washer: [1200, "1200 rpm"],
    future: [(ownRating ?? 0) + 1, String((ownRating ?? 0) + 1)],
    mirror: [reverseDigits(ownRating ?? 0), String(reverseDigits(ownRating ?? 0))],
    self: [ownRating ?? 0, String(ownRating ?? 0)],
    error: [100001, "100001"],
    jackpot: [7777, "777"],
    nobody: [0, "0"],
  };
  const [rating, ratingText] = ratings[kind];

  return (
    <article className={cn(styles.friend, kind === "jackpot" && styles.friendGold, kind === "nobody" && styles.friendGrey, kind === "mirror" && styles.friendMirror)}>
      <NetStarArt size={34} className={styles.corner} />
      <NetFriendFace
        avatar={<NetSpecialAvatar kind={kind} />}
        title={t(`${key}.title`, { name: ownName })}
        name={kind === "mirror" || kind === "self" ? ownName : t(`${key}.name`)}
        rating={rating}
        ratingText={ratingText}
        plateLabel={t("plateLabel")}
        dan={t(`${key}.dan`)}
        classRank={t(`${key}.classRank`)}
        stars={t(`${key}.stars`)}
      />
      <div className={styles.comment}>{t(`${key}.comment`)}</div>
      <div className={styles.specialAdd}>
        <button type="button" disabled={added} onClick={() => { setAdded(true); if (kind === "self") findNetEgg("friendSelf"); }}>{t("special.addFriend")}</button>
      </div>
      {added && <p className={styles.notice} role="status">{t(`${key}.added`)}</p>}
    </article>
  );
}

export function NetFriendSearch({ ownCode, ownName, ownRating }: { ownCode: string; ownName: string; ownRating: number | null }) {
  const t = useTranslations("net.friends");
  const [query, setQuery] = useState("");
  const digitCount = query.replace(/\D/g, "").length;
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [reeling, setReeling] = useState(false);
  const [searchId, setSearchId] = useState(0);
  const emptyTries = useRef(0);
  const timer = useRef<number>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const reveal = (next: Result) => {
    setPending(false);
    setResult(next);
    setSearchId(id => id + 1);
    if (next === "jackpot") setReeling(true);
    else if (isSpecial(next) && next !== "self") {
      const id = EGG_IDS[next];
      if (id) findNetEgg(id);
    }
  };

  return (
    <>
      <form
        className={styles.searchPanel}
        onSubmit={event => {
          event.preventDefault();
          let next = lookup(query, ownCode);
          emptyTries.current = next === "empty" ? emptyTries.current + 1 : 0;
          if (emptyTries.current >= EMPTY_TRIES_FOR_NOBODY) {
            emptyTries.current = 0;
            next = "nobody";
          }
          window.clearTimeout(timer.current);
          setReeling(false);
          if (next === "empty" || next === "invalid" || next === "letters") {
            setPending(false);
            setResult(next);
            return;
          }
          setPending(true);
          setResult(null);
          timer.current = window.setTimeout(() => reveal(next), 900);
        }}
      >
        <input
          className={styles.searchInput}
          value={query}
          onChange={event => setQuery(formatCode(event.target.value))}
          placeholder={t("search.placeholder")}
          inputMode="numeric"
          autoComplete="off"
          aria-label={t("search.placeholder")}
        />
        <button type="submit" className={styles.searchButton} disabled={pending}>{t("search.submit")}</button>
        <div role="status" className={styles.searchStatus}>
          {pending && t("search.searching")}
          {!pending && !result && digitCount > 0 && /^[\d\s]+$/.test(query) && t("search.count", { count: digitCount })}
          {result && result !== "found" && !isSpecial(result) && (
            <span className={result === "notFound" ? styles.searchError : undefined}>{t(`search.${result}`)}</span>
          )}
        </div>
      </form>
      {result === "jackpot" && (
        <NetJackpotReels
          key={searchId}
          spinning={reeling}
          onDone={() => setReeling(false)}
        />
      )}
      {isSpecial(result) && !(result === "jackpot" && reeling) && (
        <NetSpecialCard key={`card-${searchId}`} kind={result} ownName={ownName} ownRating={ownRating} />
      )}
      {result === "found" && (
        <article className={styles.friend}>
          <NetStarArt size={34} className={styles.corner} />
          <NetFriendFace
            avatar={<NetAiMascot />}
            title={t("ai.title")}
            name={t("ai.name")}
            rating={NET_AI_RATING}
            plateLabel={t("plateLabel")}
            dan={t("ai.dan")}
            classRank={t("ai.classRank")}
            stars={t("ai.stars")}
          />
          <div className={styles.comment}>{t("search.found")} {t("search.already")}</div>
        </article>
      )}
    </>
  );
}
