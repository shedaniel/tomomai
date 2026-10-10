import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Flags } from "@/lib/flags";

const mocks = vi.hoisted(() => ({
  login: vi.fn(), upload: vi.fn(), progress: vi.fn(),
  log: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), child() { return this; } },
  detailedRows: [] as { songId: string; playedAt: string }[],
}));
const proxy = await vi.hoisted(async () => (await import("@/test/pg-proxy")).createProxyDb());
vi.mock("../login", () => ({ loginAndGetCookies: mocks.login }));
vi.mock("@/lib/http-agent", () => ({ agentFetch: vi.fn() }));
vi.mock("@/lib/r2", () => ({ uploadIconToR2: mocks.upload }));
vi.mock("@/server/services/games/fetch-progress", () => ({ appendFetchState: mocks.progress }));
vi.mock("@/lib/request-logger", () => ({ getLogger: () => mocks.log }));
vi.mock("@/lib/db", () => ({ db: proxy.db }));

import { getGame } from "@/lib/games/registry";
import { createFetchRun } from "@/server/services/games/fetch-run";
import type { PersistedSnapshotContext } from "@/server/services/games/types";
import { fetchChunithmScores } from "./score-source";

const profile = `<div class="player_name_in">Player</div>
  <div class="player_chara"><img src="/character.png"></div>
  <div class="player_rating_num_block">${["01", "05", "comma", "03", "00"].map(digit => `<img src="/rating_orange_${digit}.png">`).join("")}</div>
  <div class="player_honor_text">Title</div>
  <div class="user_data_play_count"><div class="user_data_text">100</div></div>
  <div class="user_data_current_play_count"><div class="user_data_text">12</div></div>`;
const navigation = (token: string) => `<form action="" method="post"><select name="genre"><option value="99">All</option></select><input type="hidden" name="token" value="${token}"></form>`;
const scoreList = (difficulty: string, token: string) => `${navigation(token)}
  <div class="musiclist_box bg_${difficulty}"><div class="music_title"> Raw　Title </div><div class="play_musicdata_highscore"><span class="text_b">1,009,000</span></div><div class="play_musicdata_icon"><img src="/icon_fullcombo.png"><img src="/icon_clear.png"></div></div>
  <div class="musiclist_box bg_${difficulty}"><div class="music_title">Unplayed</div></div>`;
const playRow = (basePath: string, index: number, level = "expert") => `<form action="${basePath}record/playlog/sendPlaylogDetail/">
  <input type="hidden" name="token" value="detail-token"><input type="hidden" name="idx" value="${index}">
  <div class="frame02 w400"><div class="play_datalist_date">2026/09/28 12:3${index}</div><div class="play_track_text">TRACK ${index}</div>
  <div class="play_track_result"><img src="/musiclevel_${level}.png"></div><div class="play_musicdata_title">Raw　Title</div>
  <div class="play_musicdata_score_text">1,000,000</div><div class="play_musicdata_icon"><img src="/icon_clear.png"></div></div></form>`;
const recents = (basePath: string) => [1, 2].map(index => playRow(basePath, index)).join("");
const detail = (maxCombo: number) => maxCombo === 0 ? "<div>Unexpected layout</div>" : `<div class="play_data_detail_maxcombo_block">${maxCombo}</div>
  ${["critical", "justice", "attack", "miss"].map(name => `<div class="play_data_detail_judge_text text_${name}">1</div>`).join("")}
  ${["tap_red", "hold_yellow", "slide_blue", "air_green", "flick_skyblue"].map(name => `<div class="play_data_detail_notes_text text_${name}">101.25%</div>`).join("")}`;
const context = { game: "chunithm" as const, userId: "user", region: "jp" as const, token: "account://test:://test", sessionId: BigInt(1), gameVersion: 9, flags: {} as Flags, shouldFetchAlbums: false, signal: new AbortController().signal };

function response(url: string, body: string, init: ResponseInit = {}) {
  return Object.defineProperty(new Response(body, init), "url", { value: url });
}

function fetchScores(region: "jp" | "intl" = "jp") {
  const ctx = { ...context, region };
  return fetchChunithmScores(ctx, createFetchRun(ctx));
}

// Plays of "Raw　Title" EXPERT resolve to song 7, as persistence resolved them.
const persisted: PersistedSnapshotContext = {
  game: "chunithm", userId: "user", region: "jp", snapshotId: 1, gameVersion: 9,
  chartResolution: new Map([["Raw　Title|2|0", BigInt(7)]]),
};

function detailUpdates() {
  return proxy.updated("user_recent_songs").map(({ values, where }) => ({
    metadata: JSON.parse(String(values.metadata)) as { maxCombo: number },
    where,
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  proxy.reset();
  proxy.answer(({ sql }) => sql.startsWith("select") ? mocks.detailedRows : undefined);
  mocks.detailedRows = [];
  mocks.login.mockResolvedValue("session=start");
  mocks.upload.mockResolvedValue({ url: "https://images.test/icons/character.png" });
});
afterEach(() => vi.unstubAllGlobals());

const sites = [
  { region: "jp" as const, origin: "https://new.chunithm-net.com", basePath: "/chuni-mobile/html/mobile/" },
  { region: "intl" as const, origin: "https://chunithm-net-eng.com", basePath: "/mobile/" },
];

function serveSite({ origin, basePath }: (typeof sites)[number], playlog = recents(basePath), failingDetail?: number): string[] {
  const requests: string[] = [];
  let selected = 0;
  let expectedToken = "initial";
  let expectedCookie = "session=start";
  vi.stubGlobal("fetch", vi.fn(async (input: URL, init: RequestInit) => {
    const url = input.href;
    const path = input.pathname.replace(basePath, "");
    const headers = new Headers(init.headers);
    expect(input.origin).toBe(origin);
    expect(headers.get("Cookie")).toBe(expectedCookie);
    requests.push(`${init.method ?? "GET"} ${path}`);
    if (path === "home/playerData") return response(url, profile);
    if (path === "record/musicGenre") return response(url, navigation(expectedToken));
    if (path.startsWith("record/musicGenre/send")) {
      const fields = new URLSearchParams(String(init.body));
      expect(fields.get("genre")).toBe("99");
      expect(fields.get("token")).toBe(expectedToken);
      expect(init.method).toBe("POST");
      const difficulty = path.slice("record/musicGenre/send".length).toLowerCase();
      expectedToken = difficulty;
      expectedCookie = `session=${difficulty}`;
      return response(url, "", { status: 302, headers: { Location: `${basePath}record/musicGenre/${difficulty}`, "Set-Cookie": `${expectedCookie}; Path=/` } });
    }
    if (path.startsWith("record/musicGenre/")) {
      expect(init.method).toBeUndefined();
      return response(url, scoreList(path.split("/").at(-1)!, expectedToken));
    }
    if (path === "record/playlog") return response(url, playlog);
    if (path === "record/playlog/sendPlaylogDetail/") {
      selected = Number(new URLSearchParams(String(init.body)).get("idx"));
      return response(url, "", { status: 302, headers: { Location: `${basePath}record/playlogDetail/` } });
    }
    if (path === "record/playlogDetail/") return response(url, detail(failingDetail === selected ? 0 : selected * 100));
    if (input.pathname === "/character.png") return response(url, "image", { headers: { "Content-Type": "image/png" } });
    throw new Error(`Unexpected fixture route ${path}`);
  }));
  return requests;
}

it.each(sites)("collects $region charts and recent plays through one renewing session, and reports each stage", async site => {
  const { region } = site;
  const requests = serveSite(site);
  const { result, enrich } = await fetchScores(region);
  expect(result.player).toMatchObject({ rating: 1530, totalPlayCount: 100, currentVersionPlayCount: 12, iconUrl: "https://images.test/icons/character.png" });
  expect(result.scores).toHaveLength(5);
  expect(result.scores.map(score => score.chart)).toEqual([0, 1, 2, 3, 4].map(difficulty => ({ game: "chunithm", region, version: 9, songName: "Raw　Title", chartType: 0, difficulty })));
  expect(result.recents?.map(recent => [recent.track, recent.playedAt.toISOString()])).toEqual([[1, "2026-09-28T03:31:00.000Z"], [2, "2026-09-28T03:32:00.000Z"]]);
  expect(requests.some(path => path.includes("laylogDetail"))).toBe(false);
  expect(enrich).toBeDefined();
  expect(mocks.progress.mock.calls.map(([, state]) => state)).toEqual(getGame("chunithm").fetchStages);
});

it.each(sites)("reads each $region play's details after the snapshot is saved, one selection at a time", async site => {
  const requests = serveSite(site);
  const { enrich } = await fetchScores(site.region);
  await enrich!({ ...persisted, region: site.region });
  expect(requests.filter(path => path.includes("laylogDetail"))).toEqual([
    "POST record/playlog/sendPlaylogDetail/", "GET record/playlogDetail/", "POST record/playlog/sendPlaylogDetail/", "GET record/playlogDetail/",
  ]);
  const updates = detailUpdates();
  expect(updates.map(update => update.metadata.maxCombo)).toEqual([100, 200]);
  expect(updates[0].metadata).toMatchObject({ notePercentages: { tap: 101.25 } });
  expect(updates[0].where).toEqual(expect.arrayContaining(["user", "chunithm", "2026-09-28T03:31:00.000Z"]));
});

it("skips plays whose details are already stored", async () => {
  const [site] = sites;
  const requests = serveSite(site);
  mocks.detailedRows = [{ songId: "7", playedAt: "2026-09-28 03:31:00" }];
  const { enrich } = await fetchScores();
  await enrich!(persisted);
  expect(requests.filter(path => path.startsWith("POST record/playlog"))).toHaveLength(1);
  expect(detailUpdates().map(update => update.metadata.maxCombo)).toEqual([200]);
  // Only a stored playlog makes a play detailed, and a fake cannot evaluate that filter.
  expect(proxy.queries.find(query => query.sql.startsWith("select"))?.sql).toContain('"metadata" is not null');
});

it("keeps reading the other plays when one detail page cannot be read", async () => {
  const [site] = sites;
  serveSite(site, undefined, 1);
  const { enrich } = await fetchScores();
  await expect(enrich!(persisted)).resolves.toBeUndefined();
  expect(detailUpdates().map(update => update.metadata.maxCombo)).toEqual([200]);
  expect(mocks.log.warn).toHaveBeenCalledWith({ err: expect.any(Error) }, "Could not read a CHUNITHM recent play's details");
});

it("still ingests scores and the other recents when the history holds a WORLD'S END play", async () => {
  const [site] = sites;
  serveSite(site, playRow(site.basePath, 1, "worldsend") + playRow(site.basePath, 2));
  const { result } = await fetchScores();
  expect(result.scores).toHaveLength(5);
  expect(result.recents?.map(play => play.track)).toEqual([2]);
  expect(mocks.log.info).toHaveBeenCalledWith({ recordCount: 1, skipped: 1 }, "Read CHUNITHM recent plays");
});

it("has nothing to enrich without recent plays", async () => {
  const [site] = sites;
  serveSite(site, "");
  const { result, enrich } = await fetchScores();
  expect(result.recents).toEqual([]);
  expect(enrich).toBeUndefined();
});

it("rejects an authenticated subscription gate after its HTTP 200 redirect without returning partial data or uploading an icon", async () => {
  vi.stubGlobal("fetch", vi.fn(async (input: URL) => {
    if (input.pathname.endsWith("home/playerData")) return response(input.href, profile);
    if (input.pathname.endsWith("record/musicGenre")) return response(input.href, "", { status: 302, headers: { Location: "/chuni-mobile/html/mobile/rightLimit/" } });
    return response(input.href, '<div class="riyouken_block00">利用権が必要です。<p>利用権が無いため、サービスをご利用いただけません。</p></div>');
  }));
  await expect(fetchScores()).rejects.toThrow("SUBSCRIPTION_REQUIRED");
  expect(mocks.upload).not.toHaveBeenCalled();
});
