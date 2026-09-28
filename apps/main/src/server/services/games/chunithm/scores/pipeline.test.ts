import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Flags } from "@/lib/flags";

const mocks = vi.hoisted(() => ({ login: vi.fn(), upload: vi.fn(), progress: vi.fn() }));
vi.mock("../login", () => ({ loginAndGetCookies: mocks.login }));
vi.mock("@/lib/http-agent", () => ({ agentFetch: vi.fn() }));
vi.mock("@/lib/r2", () => ({ uploadIconToR2: mocks.upload }));
vi.mock("@/lib/fetch-states-server", () => ({ appendFetchState: mocks.progress }));
vi.mock("@/lib/request-logger", () => ({ getLogger: () => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn(), child() { return this; } }) }));

import { fetchPlayer } from "./pipeline";

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
const recents = (basePath: string) => [1, 2].map(index => `<form action="${basePath}record/playlog/sendPlaylogDetail/">
  <input type="hidden" name="token" value="detail-token"><input type="hidden" name="idx" value="${index}">
  <div class="frame02 w400"><div class="play_datalist_date">2026/09/28 12:30</div><div class="play_track_text">TRACK ${index}</div>
  <div class="play_track_result"><img src="/musiclevel_expert.png"></div><div class="play_musicdata_title">Raw　Title</div>
  <div class="play_musicdata_score_text">1,000,000</div><div class="play_musicdata_icon"><img src="/icon_clear.png"></div></div></form>`).join("");
const detail = (maxCombo: number) => `<div class="play_data_detail_maxcombo_block">${maxCombo}</div>
  ${["critical", "justice", "attack", "miss"].map(name => `<div class="play_data_detail_judge_text text_${name}">1</div>`).join("")}
  ${["tap_red", "hold_yellow", "slide_blue", "air_green", "flick_skyblue"].map(name => `<div class="play_data_detail_notes_text text_${name}">101.25%</div>`).join("")}`;
const context = { game: "chunithm" as const, userId: "user", region: "jp" as const, token: "account://test:://test", sessionId: BigInt(1), gameVersion: 9, flags: {} as Flags, shouldFetchAlbums: false, signal: new AbortController().signal };

function response(url: string, body: string, init: ResponseInit = {}) {
  return Object.defineProperty(new Response(body, init), "url", { value: url });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.login.mockResolvedValue("session=start");
  mocks.upload.mockResolvedValue({ url: "https://images.test/icons/character.png" });
});
afterEach(() => vi.unstubAllGlobals());

it.each([
  { region: "jp" as const, origin: "https://new.chunithm-net.com", basePath: "/chuni-mobile/html/mobile/" },
  { region: "intl" as const, origin: "https://chunithm-net-eng.com", basePath: "/mobile/" },
])("collects $region charts and paired recent details through one renewing session", async ({ region, origin, basePath }) => {
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
    if (path === "record/playlog") return response(url, recents(basePath));
    if (path === "record/playlog/sendPlaylogDetail/") {
      selected = Number(new URLSearchParams(String(init.body)).get("idx"));
      return response(url, "", { status: 302, headers: { Location: `${basePath}record/playlogDetail/` } });
    }
    if (path === "record/playlogDetail/") return response(url, detail(selected * 100));
    if (input.pathname === "/character.png") return response(url, "image", { headers: { "Content-Type": "image/png" } });
    throw new Error(`Unexpected fixture route ${path}`);
  }));
  const result = await fetchPlayer({ ...context, region });
  expect(result.player).toMatchObject({ rating: 1530, totalPlayCount: 100, currentVersionPlayCount: 12, iconUrl: "https://images.test/icons/character.png" });
  expect(result.scores).toHaveLength(5);
  expect(result.scores.map(score => score.chart)).toEqual([0, 1, 2, 3, 4].map(difficulty => ({ game: "chunithm", region, version: 9, songName: "Raw　Title", chartType: 0, difficulty })));
  expect(result.recents?.map(recent => recent.details?.maxCombo)).toEqual([100, 200]);
  expect(result.recents?.[0].playedAt.toISOString()).toBe("2026-09-28T03:30:00.000Z");
  expect(result.recents?.[0].details?.notePercentages).toMatchObject({ tap: 101.25 });
  expect(requests.filter(path => path.includes("playlogDetail") || path.includes("sendPlaylogDetail"))).toEqual([
    "POST record/playlog/sendPlaylogDetail/", "GET record/playlogDetail/", "POST record/playlog/sendPlaylogDetail/", "GET record/playlogDetail/",
  ]);
});

it("rejects an authenticated subscription gate after its HTTP 200 redirect without returning partial data or uploading an icon", async () => {
  vi.stubGlobal("fetch", vi.fn(async (input: URL) => {
    if (input.pathname.endsWith("home/playerData")) return response(input.href, profile);
    if (input.pathname.endsWith("record/musicGenre")) return response(input.href, "", { status: 302, headers: { Location: "/chuni-mobile/html/mobile/rightLimit/" } });
    return response(input.href, '<div class="riyouken_block00">利用権が必要です。<p>利用権が無いため、サービスをご利用いただけません。</p></div>');
  }));
  await expect(fetchPlayer(context)).rejects.toThrow("SUBSCRIPTION_REQUIRED");
  expect(mocks.upload).not.toHaveBeenCalled();
});
