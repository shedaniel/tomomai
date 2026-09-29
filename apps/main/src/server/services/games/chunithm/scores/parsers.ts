import { load, type CheerioAPI } from "cheerio";
import { GAME_CODES, codeOf, type CodeKey } from "@/lib/games/codes";
import { formatFetchError } from "@/lib/games/fetch-error-codes";
import type { NormalizedPlayer, NormalizedRecent, NormalizedScore } from "@/server/services/games/types";
import type { ChunithmRecentDetails } from "@/lib/games/chunithm/recent-details";
import type { Region } from "@/lib/types";

const SITE_ACTIONS = {
  basic: "Basic",
  advanced: "Advanced",
  expert: "Expert",
  master: "Master",
  ultima: "Ultima",
} as const satisfies Partial<Record<CodeKey<"chunithm", "difficulty">, string>>;

type SiteDifficulty = keyof typeof SITE_ACTIONS;

export const CHUNITHM_DIFFICULTIES = GAME_CODES.chunithm.difficulty
  .filter((name): name is SiteDifficulty => name in SITE_ACTIONS)
  .map(name => ({ id: codeOf("chunithm", "difficulty", name), name, action: SITE_ACTIONS[name] }));

const STANDARD_CHART_TYPE = codeOf("chunithm", "chartType", "standard");

type StatusKind = "comboStatus" | "syncStatus" | "clearStatus";

const STATUS_ICONS: { readonly [K in StatusKind]: Readonly<Record<string, CodeKey<"chunithm", K>>> } = {
  comboStatus: { icon_fullcombo: "fc", icon_alljustice: "aj", icon_alljusticecritical: "ajc" },
  syncStatus: { icon_fullchain2: "full-chain", icon_fullchain: "full-chain-aj" },
  clearStatus: { icon_clear: "clear", icon_hard: "hard", icon_brave: "brave", icon_absolute: "absolute", icon_catastrophy: "catastrophy" },
};

type ChartContext = { region: Region; gameVersion: number };
export type ChunithmForm = { action: string; fields: URLSearchParams };

function integer(text: string): number {
  const value = text.trim().replace(/,/g, "");
  if (!/^\d+$/.test(value)) throw new Error("Unexpected CHUNITHM numeric field");
  return Number(value);
}

export function assertChunithmPage(html: string, url: string): void {
  const $ = load(html);
  const gate = $(".riyouken_block00").text().replace(/\s+/g, "");
  if (gate.includes("利用権が必要です。") && gate.includes("利用権が無いため、サービスをご利用いただけません。")) {
    throw new Error(formatFetchError("SUBSCRIPTION_REQUIRED", "Fetching complete CHUNITHM JP scores requires an active ゲキチュウマイ-NET subscription. Your existing data has not been changed."));
  }
  if ($("input[name=segaId], input[name=sid]").length || new URL(url).pathname.endsWith("/aimeList/")) {
    throw new Error("CHUNITHM login session expired. Please sign in again.");
  }
}

function formFields($: CheerioAPI, selector: string): URLSearchParams {
  const element = $(selector).first();
  if (!element.length) throw new Error("Missing CHUNITHM navigation form");
  const fields = new URLSearchParams();
  element.find("input[type=hidden][name]").each((_, input) => {
    fields.set($(input).attr("name")!, $(input).attr("value") ?? "");
  });
  if (!fields.get("token")) throw new Error("Missing CHUNITHM navigation token");
  return fields;
}

function form($: CheerioAPI, selector: string): ChunithmForm {
  const action = $(selector).first().attr("action");
  if (!action) throw new Error("Missing CHUNITHM navigation form");
  return { action, fields: formFields($, selector) };
}

export function parseMusicGenreForm(html: string): URLSearchParams {
  return formFields(load(html), "form:has(select[name=genre])");
}

export function parsePlayer(html: string, pageUrl: string): NormalizedPlayer {
  const $ = load(html);
  const displayName = $(".player_name_in").first().text().trim();
  const icon = $(".player_chara > img").first().attr("src");
  if (!displayName || !icon) throw new Error("Missing CHUNITHM player profile");
  const ratingDigits = $(".player_rating_num_block img").map((_, image) => {
    const match = $(image).attr("src")?.match(/rating_[a-z]+_(\d{2}|comma)\.png(?:\?.*)?$/);
    if (!match) throw new Error("Unexpected CHUNITHM rating image");
    if (match[1] === "comma") return ".";
    const digit = Number(match[1]);
    if (digit > 9) throw new Error("Unexpected CHUNITHM rating digit");
    return String(digit);
  }).get().join("");
  if (!/^\d+\.\d{2}$/.test(ratingDigits)) throw new Error("Unexpected CHUNITHM player rating");
  return {
    displayName,
    rating: Math.round(Number(ratingDigits) * 100),
    title: $(".player_honor_text").first().text().trim(),
    titleType: 0,
    iconUrl: new URL(icon, pageUrl).href,
    totalPlayCount: integer($(".user_data_play_count > .user_data_text").text()),
    currentVersionPlayCount: integer($(".user_data_current_play_count > .user_data_text").text()),
  };
}

function statusCode<K extends StatusKind>(kind: K, icon: string): number {
  const key = STATUS_ICONS[kind][icon];
  return key === undefined ? 0 : codeOf("chunithm", kind, key);
}

function statuses(icons: string[]): Pick<NormalizedScore, StatusKind> {
  const result = { comboStatus: 0, syncStatus: 0, clearStatus: 0 };
  for (const source of icons) {
    const icon = source.split("/").pop()?.replace(/\.png(?:\?.*)?$/, "") ?? "";
    for (const kind of ["comboStatus", "syncStatus", "clearStatus"] as const) {
      result[kind] = Math.max(result[kind], statusCode(kind, icon));
    }
  }
  return result;
}

export function parseScores(html: string, context: ChartContext & { difficulty: number }): NormalizedScore[] {
  const $ = load(html);
  const difficulty = CHUNITHM_DIFFICULTIES.find(item => item.id === context.difficulty);
  if (!difficulty) throw new Error("Unsupported CHUNITHM difficulty");
  const rows = $(`.musiclist_box.bg_${difficulty.name}`);
  if (!rows.length) throw new Error("Missing CHUNITHM score list");
  const scores: NormalizedScore[] = [];
  rows.each((_, element) => {
    const row = $(element);
    const highScore = row.find(".play_musicdata_highscore > span.text_b");
    if (!highScore.length) return;
    const songName = row.find(".music_title").text().trim();
    if (!songName) throw new Error("Missing CHUNITHM score title");
    scores.push({
      chart: { game: "chunithm", region: context.region, version: context.gameVersion, songName, chartType: STANDARD_CHART_TYPE, difficulty: difficulty.id },
      scoreValue: integer(highScore.text()), secondaryScore: 0,
      ...statuses(row.find(".play_musicdata_icon img").map((_, image) => $(image).attr("src") ?? "").get()),
    });
  });
  return scores;
}

export type ChunithmRecentRow = { recent: NormalizedRecent; form: ChunithmForm };

/**
 * Plays of charts outside the fetched difficulties, such as WORLD'S END, are
 * skipped and counted. A page without play rows is an empty history, because
 * the page request has already verified the session.
 */
export function parseRecents(html: string, context: ChartContext): { rows: ChunithmRecentRow[]; skipped: number } {
  const $ = load(html);
  const rows: ChunithmRecentRow[] = [];
  let skipped = 0;
  $(".frame02.w400:has(.play_datalist_date)").each((_, element) => {
    const row = $(element);
    const image = row.find(".play_track_result img").attr("src") ?? "";
    const difficulty = CHUNITHM_DIFFICULTIES.find(item => image.includes(`/musiclevel_${item.name}.png`));
    if (!difficulty) {
      skipped++;
      return;
    }
    const date = row.find(".play_datalist_date").text().trim();
    const match = date.match(/^(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2})$/);
    if (!match) throw new Error("Unexpected CHUNITHM play date");
    const playedAt = new Date(`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:00+09:00`);
    const track = row.find(".play_track_text").text().trim().match(/^TRACK\s+(\d+)$/);
    if (!track || !Number.isFinite(playedAt.getTime())) throw new Error("Unexpected CHUNITHM recent record");
    const songName = row.find(".play_musicdata_title").text().trim();
    if (!songName) throw new Error("Missing CHUNITHM recent title");
    const recent: NormalizedRecent = {
      chart: { game: "chunithm", region: context.region, version: context.gameVersion, songName, chartType: STANDARD_CHART_TYPE, difficulty: difficulty.id },
      scoreValue: integer(row.find(".play_musicdata_score_text").text()), secondaryScore: 0,
      ...statuses(row.find(".play_musicdata_icon img").map((_, image) => $(image).attr("src") ?? "").get()),
      playedAt, track: Number(track[1]),
    };
    const rowForm = row.find("form").length ? row.find("form").first() : row.closest("form");
    const detail = form(load(rowForm.toString()), "form");
    if (!detail.fields.has("idx")) throw new Error("Missing CHUNITHM recent selector");
    rows.push({ recent, form: detail });
  });
  return { rows, skipped };
}

export function parseRecentDetails(html: string): ChunithmRecentDetails {
  const $ = load(html);
  const percentage = (selector: string) => {
    const match = $(selector).text().trim().match(/^(\d+(?:\.\d+)?)%$/);
    if (!match) throw new Error("Unexpected CHUNITHM note percentage");
    return Number(match[1]);
  };
  return {
    maxCombo: integer($(".play_data_detail_maxcombo_block").text()),
    judgments: {
      justiceCritical: integer($(".play_data_detail_judge_text.text_critical").text()),
      justice: integer($(".play_data_detail_judge_text.text_justice").text()),
      attack: integer($(".play_data_detail_judge_text.text_attack").text()),
      miss: integer($(".play_data_detail_judge_text.text_miss").text()),
    },
    notePercentages: {
      tap: percentage(".play_data_detail_notes_text.text_tap_red"),
      hold: percentage(".play_data_detail_notes_text.text_hold_yellow"),
      slide: percentage(".play_data_detail_notes_text.text_slide_blue"),
      air: percentage(".play_data_detail_notes_text.text_air_green"),
      flick: percentage(".play_data_detail_notes_text.text_flick_skyblue"),
    },
  };
}
