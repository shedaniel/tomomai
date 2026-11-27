"use client";

import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { maimaiVersionTable } from "@/lib/games/maimai/versions";
import { netSongDetailPath } from "@/lib/net/routes";
import { cn } from "@/lib/utils";
import { NET_DIFFICULTIES, type NetDifficulty } from "../difficulty";
import { NetButton, NetEmpty, NetNote, NetSection, NetSelect } from "../kit";
import { NetDifficultyPills } from "../net-difficulty-pills";
import { NetMusicRow } from "../net-music-row";
import { NetPaywall } from "../net-paywall";
import type { NetChartScore } from "../score";
import type { NetChartEntry, NetSong } from "./data";
import { NetScoreSummary } from "./net-score-summary";
import styles from "./songs.module.css";

const PAGE_SIZE = 20;

const TABS = [
  { id: "category", color: "#ff5f8f", ink: "#b0204f" },
  { id: "best", color: "#2ad6c8", ink: "#127a72" },
  { id: "latest", color: "#ff9a3a", ink: "#a8520a" },
] as const;
type Tab = (typeof TABS)[number]["id"];

const MODES = ["genre", "title", "level", "version", "sort"] as const;
type Mode = (typeof MODES)[number];

type Group = { key: string; entries: NetChartEntry[] };

// DX NET's genre order, matched loosely since JP and international names differ.
const GENRE_ORDER = [/pops/i, /nico|vocaloid/i, /東方/, /game|ゲーム/i, /^maimai$/i, /ongeki|オンゲキ|chunithm/i, /宴/];
const genreRank = (genre: string) => {
  const index = GENRE_ORDER.findIndex(pattern => pattern.test(genre));
  return index === -1 ? GENRE_ORDER.length : index;
};

const KANA_ROWS = ["あ", "か", "さ", "た", "な", "は", "ま", "や", "ら", "わ"];
const KANA_ROW_STARTS = [0x3041, 0x304b, 0x3055, 0x305f, 0x306a, 0x306f, 0x307e, 0x3083, 0x3089, 0x308e];
const OTHER_TITLES = "#";

function titleKey(name: string): string {
  const first = name.normalize("NFKC").charAt(0).toUpperCase();
  let code = first.charCodeAt(0);
  if (code >= 0x30a1 && code <= 0x30f6) code -= 0x60;
  if (code >= 0x3041 && code <= 0x3096) {
    let row = 0;
    while (row + 1 < KANA_ROW_STARTS.length && code >= KANA_ROW_STARTS[row + 1]) row++;
    return KANA_ROWS[row];
  }
  if (/[A-Z]/.test(first)) return first;
  if (/[0-9]/.test(first)) return "0-9";
  return OTHER_TITLES;
}

function titleRank(key: string): number {
  const kana = KANA_ROWS.indexOf(key);
  if (kana !== -1) return kana;
  if (/^[A-Z]$/.test(key)) return 100 + key.charCodeAt(0);
  return key === "0-9" ? 1000 : 1001;
}

const levelValue = (level: string) => parseFloat(level) + (level.includes("+") ? 0.5 : 0) || 0;

const byOrder = (a: NetChartEntry, b: NetChartEntry) => a.song.order - b.song.order;
const byScore = (a: NetChartEntry, b: NetChartEntry) => (b.chart[2] ?? -1) - (a.chart[2] ?? -1) || byOrder(a, b);
const byName = (a: NetChartEntry, b: NetChartEntry) => a.song.name.localeCompare(b.song.name, "ja");

function groupKey(mode: Mode, { song, chart }: NetChartEntry): string {
  switch (mode) {
    case "genre": return song.genre;
    case "title": return titleKey(song.name);
    case "level": return chart[1];
    case "version": return String(song.version);
    case "sort": return "all";
  }
}

function compareGroupKeys(mode: Mode, a: string, b: string): number {
  switch (mode) {
    case "genre": return genreRank(a) - genreRank(b) || a.localeCompare(b);
    case "title": return titleRank(a) - titleRank(b);
    case "level": return levelValue(a) - levelValue(b) || a.localeCompare(b);
    case "version": return Number(a) - Number(b);
    case "sort": return 0;
  }
}

function toScore({ song, chart }: NetChartEntry): NetChartScore {
  const [difficultyCode, level, scoreValue, secondaryScore, comboStatus, syncStatus] = chart;
  return { songName: song.name, level, difficultyCode, typeCode: song.typeCode, scoreValue, secondaryScore, comboStatus, syncStatus };
}

export function NetSongScores({ songs, base }: { songs: NetSong[]; base: string }) {
  const t = useTranslations("net.songs");
  const [tab, setTab] = useState<Tab>("category");
  const [mode, setMode] = useState<Mode>("genre");
  const [filter, setFilter] = useState("all");
  const [difficulty, setDifficulty] = useState<NetDifficulty>("master");
  const [limit, setLimit] = useState(PAGE_SIZE);

  const entries = useMemo(() => {
    const code = NET_DIFFICULTIES.indexOf(difficulty);
    return songs.flatMap(song => song.charts.filter(chart => chart[0] === code).map(chart => ({ song, chart })));
  }, [songs, difficulty]);

  const groupLabel = (key: string) => {
    switch (mode) {
      case "level": return t("levelGroup", { level: key });
      case "version": return maimaiVersionTable.get(Number(key))?.name ?? key;
      case "title": return key === OTHER_TITLES ? t("otherTitles") : key;
      case "sort": return t("sortHeading");
      default: return key;
    }
  };

  const allGroups = useMemo((): Group[] => {
    if (tab === "best") {
      return [{ key: "best", entries: entries.filter(entry => entry.chart[2] != null).sort(byScore) }];
    }
    if (tab === "latest") {
      const latest = new Set([...songs].sort((a, b) => b.version - a.version || b.order - a.order).slice(0, 10));
      return [{ key: "latest", entries: entries.filter(entry => latest.has(entry.song)).sort((a, b) => b.song.version - a.song.version || b.song.order - a.song.order) }];
    }
    const groups = new Map<string, NetChartEntry[]>();
    for (const entry of entries) {
      const key = groupKey(mode, entry);
      const list = groups.get(key);
      if (list) list.push(entry);
      else groups.set(key, [entry]);
    }
    const sorter = mode === "sort" ? byScore : mode === "title" ? byName : byOrder;
    return [...groups]
      .sort(([a], [b]) => compareGroupKeys(mode, a, b))
      .map(([key, list]) => ({ key, entries: list.sort(sorter) }));
  }, [tab, mode, entries, songs]);

  const filtering = tab === "category" && mode !== "sort";
  const groups = filtering && filter !== "all" ? allGroups.filter(group => group.key === filter) : allGroups;
  const shownEntries = groups.flatMap(group => group.entries);
  const total = shownEntries.length;

  const reset = () => setLimit(PAGE_SIZE);
  const pickTab = (next: Tab) => { setTab(next); reset(); };
  const pickMode = (next: Mode) => { setMode(next); setFilter("all"); reset(); };
  const pickDifficulty = (next: NetDifficulty) => { setDifficulty(next); reset(); };

  let remaining = limit;
  const blocks: ReactNode[] = [];
  for (const group of groups) {
    if (remaining <= 0) break;
    const visible = group.entries.slice(0, remaining);
    remaining -= visible.length;
    if (!visible.length) continue;
    const heading = tab === "best" ? t("bestHeading") : tab === "latest" ? t("latestHeading") : groupLabel(group.key);
    blocks.push(
      <div key={group.key}>
        <NetSection>{heading}</NetSection>
        {visible.map(entry => (
          <NetMusicRow
            key={`${entry.song.order}-${entry.song.name}-${entry.chart[0]}`}
            score={toScore(entry)}
            href={netSongDetailPath(base, entry.song.id)}
          />
        ))}
      </div>,
    );
  }
  const shown = Math.min(limit, total);
  const list = total === 0 ? <NetEmpty>{t("empty")}</NetEmpty> : <>{blocks}</>;

  return (
    <>
      <div className={styles.tabs} role="tablist">
        {TABS.map(({ id, color, ink }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={cn(styles.tab, tab === id && styles.tabOn)}
            style={{ "--tab": color, "--tab-ink": ink } as CSSProperties}
            onClick={() => pickTab(id)}
          >
            {t(`tabs.${id}`)}
          </button>
        ))}
      </div>
      <div className={styles.panel}>
        {tab === "category" && (
          <>
            <div className={styles.modes}>
              {MODES.map(id => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={mode === id}
                  className={cn(styles.mode, mode === id && styles.modeOn, id === "sort" && styles.modeSort)}
                  onClick={() => pickMode(id)}
                >
                  {t(`modes.${id}`)}
                </button>
              ))}
            </div>
            <NetSelect
              aria-label={t("filterLabel")}
              value={filtering ? filter : "all"}
              disabled={!filtering}
              onChange={event => { setFilter(event.target.value); reset(); }}
            >
              <option value="all">{t(`all.${mode}`)}</option>
              {filtering && allGroups.map(group => <option key={group.key} value={group.key}>{groupLabel(group.key)}</option>)}
            </NetSelect>
          </>
        )}
        <NetDifficultyPills value={difficulty} onChange={pickDifficulty} />
      </div>
      <NetScoreSummary entries={shownEntries} />
      {mode === "sort" && tab === "category" ? <NetPaywall feature={t("sortFeature")}>{list}</NetPaywall> : list}
      {total > 0 && (
        <>
          <NetNote>{shown < total ? t("showing", { shown, total: total.toLocaleString() }) : t("allShown")}</NetNote>
          {shown < total && (
            <div className={styles.more}>
              <NetButton onClick={() => setLimit(limit + PAGE_SIZE)}>{t("more")}</NetButton>
            </div>
          )}
        </>
      )}
    </>
  );
}
