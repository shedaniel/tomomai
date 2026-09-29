import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Flags } from "@/lib/flags";

const mocks = vi.hoisted(() => ({
  login: vi.fn(), upload: vi.fn(), progress: vi.fn(), details: vi.fn(), albums: vi.fn(),
  log: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn(), child() { return this; } },
}));
vi.mock("../../login", () => ({ openMaimaiSegaSession: mocks.login }));
vi.mock("@/lib/r2", () => ({ uploadIconToR2: mocks.upload }));
vi.mock("@/lib/fetch-states-server", () => ({ appendFetchState: mocks.progress }));
vi.mock("@/lib/request-logger", () => ({ getLogger: () => mocks.log }));
vi.mock("../recents/details", () => ({ fetchAndInsertRecentSongsData: mocks.details }));
vi.mock("../albums/persist", () => ({ persistAlbumData: mocks.albums }));

import { getGame } from "@/lib/games/registry";
import { createFetchRun } from "@/server/services/games/fetch-run";
import type { PersistedSnapshotContext, ScoreFetchContext } from "@/server/services/games/types";
import { fetchWithSegaLogin } from "./sega-scrape";

const MOBILE_ROOT = "/maimai-mobile/";
const token = { provider: "sega-account", username: "name", password: "password" } as const;

const profile = `<div class="see_through_block">
  <img class="w_112" src="/maimai-mobile/img/Icon/a.png">
  <div class="name_block">Player</div>
  <div class="rating_block">15000</div>
  <div class="trophy_block trophy_Gold">Title</div>
  <div class="p_l_10 f_l f_14">×12</div>
  <div class="t_r f_12">play count of current version：195 maimaiDX total play count：909</div>
  <img class="h_35 f_l" src="/maimai-mobile/img/course/b.png">
  <img class="h_35 f_l" src="/maimai-mobile/img/class/c.png">
</div>`;
const masterScores = `<div><img class="music_kind_icon" src="/img/music_dx.png"><div class="music_master_score_back">
  <div class="music_lv_block">14+</div><div class="music_name_block">Song</div>
  <div class="music_score_block">100.5000%</div><div class="music_score_block">321 / 400</div>
  <img class="h_30" src="/img/music_icon_fsp.png"><img class="h_30" src="/img/music_icon_app.png">
</div></div>`;
const hiddenScores = `<div class="music_basic_score_back"><img class="music_kind_icon" src="/img/music_standard.png">
  <div class="music_name_block">Hidden</div><div class="music_score_block">97.0000%</div></div>`;
const recentPlay = `<div class="p_10 t_l f_0 v_b">
  <div class="sub_title"><span class="red">TRACK 01</span><span class="v_b">2026/09/28 12:30</span></div>
  <img class="playlog_diff" src="/img/diff_master.png">
  <div class="basic_block"><div class="music_lv_back">14+</div>Song</div>
  <div class="playlog_achievement_txt">100.5000%</div>
  <div class="playlog_score_block"><div class="f_15">321 / 400</div></div>
  <div class="playlog_result_innerblock"><img src="/img/none.png"><img src="/img/none.png"></div>
  <img class="playlog_music_kind_icon" src="/img/music_dx.png">
  <input name="idx" value="0,1">
</div>`;

function context(overrides: Partial<ScoreFetchContext> = {}): ScoreFetchContext {
  return {
    game: "maimai", userId: "user", region: "intl", token: "account://name:://password", sessionId: BigInt(1), gameVersion: 14,
    flags: {} as Flags, shouldFetchAlbums: false, signal: new AbortController().signal, ...overrides,
  };
}

function serveSite({ recents = "", hidden = hiddenScores, onPlayerData }: { recents?: string; hidden?: string | null; onPlayerData?: () => void } = {}): string[] {
  const requests: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: URL) => {
    const path = input.pathname.replace(MOBILE_ROOT, "") + input.search;
    requests.push(path);
    if (path === "playerData/") {
      onPlayerData?.();
      return new Response(profile);
    }
    if (path.startsWith("record/musicGenre/search/")) return new Response(input.searchParams.get("diff") === "3" ? masterScores : "");
    if (path === "record/") return new Response(recents);
    if (path === "playerData/photo/") return new Response("");
    if (path === "home/ratingTargetMusic/") return hidden === null ? new Response("", { status: 500 }) : new Response(hidden);
    if (path === "img/Icon/a.png") return new Response("icon", { headers: { "Content-Type": "image/png" } });
    throw new Error(`Unexpected fixture route ${path}`);
  }));
  return requests;
}

function fetchScores(ctx: ScoreFetchContext) {
  return fetchWithSegaLogin(ctx, token, createFetchRun(ctx));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.login.mockResolvedValue({ cookies: "session=1" });
  mocks.upload.mockResolvedValue({ url: "https://images.test/icons/a.png" });
});
afterEach(() => vi.unstubAllGlobals());

describe("maimai DX NET scrape", () => {
  it("reads every maimai stage and returns the normalized result", async () => {
    const requests = serveSite();
    const { result, enrich } = await fetchScores(context());
    expect(mocks.login).toHaveBeenCalledWith("user", "intl", token, expect.any(AbortSignal));
    expect(requests.filter(path => path.startsWith("record/musicGenre/search/")).map(path => new URLSearchParams(path.split("?")[1]).get("diff")).sort())
      .toEqual(["0", "1", "10", "2", "3", "4"]);
    expect(mocks.progress.mock.calls.map(([, state]) => state).sort()).toEqual([...getGame("maimai").fetchStages].sort());
    expect(result.player).toMatchObject({ displayName: "Player", rating: 15000, iconUrl: "https://images.test/icons/a.png" });
    expect(result.scores).toEqual([
      expect.objectContaining({ chart: { game: "maimai", region: "intl", version: 14, songName: "Song", chartType: 1, difficulty: 3 }, scoreValue: 1_005_000 }),
      expect.objectContaining({ chart: { game: "maimai", region: "intl", version: 14, songName: "Hidden", chartType: 0, difficulty: 0 }, scoreValue: 970_000 }),
    ]);
    expect(result.events).toEqual([]);
    expect(enrich).toBeUndefined();
  });

  it("reads the album page only for a player who keeps album photos", async () => {
    const requests = serveSite();
    await fetchScores(context());
    expect(requests).not.toContain("playerData/photo/");
    await fetchScores(context({ shouldFetchAlbums: true }));
    expect(requests).toContain("playerData/photo/");
  });

  it("continues without hidden songs when their page fails", async () => {
    serveSite({ hidden: null });
    const { result } = await fetchScores(context());
    expect(result.scores.map(score => score.chart.songName)).toEqual(["Song"]);
    expect(mocks.log.warn).toHaveBeenCalledWith({ err: expect.any(Error) }, "Continuing without maimai hidden songs");
  });

  it("stops before the icon upload once the fetch is aborted", async () => {
    const controller = new AbortController();
    const timedOut = new Error("Fetch operation timed out after 2 minutes");
    const requests = serveSite({ onPlayerData: () => controller.abort(timedOut) });
    await expect(fetchScores(context({ signal: controller.signal }))).rejects.toBe(timedOut);
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(requests).toEqual(["playerData/"]);
  });

  it("saves play details and album photos after the snapshot, and one failing does not stop the other", async () => {
    serveSite({ recents: recentPlay });
    const { result, enrich } = await fetchScores(context({ shouldFetchAlbums: true }));
    expect(result.recents).toEqual([expect.objectContaining({ track: 1, playedAt: new Date("2026-09-28T03:30:00.000Z"), maxDxScore: 400 })]);
    mocks.details.mockRejectedValueOnce(new Error("detail layout changed"));
    const persisted = { userId: "user", region: "intl", chartResolution: new Map() } as PersistedSnapshotContext;
    await expect(enrich!(persisted)).resolves.toBeUndefined();
    expect(mocks.details).toHaveBeenCalledWith("user", "intl", expect.anything(), [expect.objectContaining({ songName: "Song", idx: "0,1" })]);
    expect(mocks.albums).toHaveBeenCalledWith("user", persisted.chartResolution, [], expect.any(Function));
    expect(mocks.log.error).toHaveBeenCalledWith({ err: new Error("detail layout changed"), stepType: "recentDetails" }, "Could not save maimai recent play details");
  });
});
