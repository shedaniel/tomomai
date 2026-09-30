import { describe, expect, it } from "vitest";
import { isSongDataState, songDataState } from "@/lib/fetch-states";
import { codeOf } from "@/lib/games/codes";
import { getGame } from "@/lib/games/registry";
import { assertChunithmPage, CHUNITHM_DIFFICULTIES, parseMusicGenreForm, parsePlayer, parsePlaylog, parseRecents, parseScores } from "./parsers";

const context = { region: "jp" as const, gameVersion: 23 };

describe("CHUNITHM records", () => {
  it("reads exactly the difficulties CHUNITHM declares fetch stages for", () => {
    expect(CHUNITHM_DIFFICULTIES.map(difficulty => songDataState("chunithm", difficulty.id)))
      .toEqual(getGame("chunithm").fetchStages.filter(isSongDataState));
  });

  it("reads genre navigation fields before the site's JavaScript assigns the action", () => {
    const html = `<form action="" method="post"><select name="genre"><option value="99">All</option></select>
      <input type="hidden" name="token" value="genre-token"></form>
      <form action="/record/musicGenre/sendMusicDetail/"><input type="hidden" name="token" value="detail-token"></form>`;
    expect(Object.fromEntries(parseMusicGenreForm(html))).toEqual({ token: "genre-token" });
    expect(() => parseMusicGenreForm('<form><input type="hidden" name="token" value="unrelated"></form>')).toThrow("Missing CHUNITHM navigation form");
    expect(() => parseMusicGenreForm('<form action=""><select name="genre"></select></form>')).toThrow("Missing CHUNITHM navigation token");
  });

  it("distinguishes played zero scores from unplayed charts and ignores aggregate status icons", () => {
    const html = `<div class="score_list"><img src="icon_fullchain.png"></div>
      <div class="musiclist_box bg_expert"><div class="music_title">Unplayed</div></div>
      <div class="musiclist_box bg_expert"><div class="music_title">０ Song</div>
        <div class="play_musicdata_highscore"><span class="text_b">0</span></div>
        <div class="play_musicdata_icon"><img src="icon_clear.png"><img src="icon_rank_0.png"><img src="icon_fullchain2.png"></div></div>
      <div class="musiclist_box bg_expert"><div class="music_title">AJC</div>
        <div class="play_musicdata_highscore"><span class="text_b">1,010,000</span></div>
        <div class="play_musicdata_icon"><img src="icon_alljusticecritical.png"><img src="icon_catastrophy.png"><img src="icon_fullchain.png"></div></div>`;
    expect(parseScores(html, { ...context, difficulty: 2 })).toEqual([
      { chart: { game: "chunithm", region: "jp", version: 23, songName: "０ Song", chartType: 0, difficulty: 2 }, scoreValue: 0, secondaryScore: 0, comboStatus: 0, syncStatus: 1, clearStatus: 1 },
      { chart: { game: "chunithm", region: "jp", version: 23, songName: "AJC", chartType: 0, difficulty: 2 }, scoreValue: 1010000, secondaryScore: 0, comboStatus: 3, syncStatus: 2, clearStatus: 5 },
    ]);
    expect(() => parseScores("<html>Sign in</html>", { ...context, difficulty: 2 })).toThrow("Missing CHUNITHM score list");
  });

  it("encodes every status icon with the canonical CHUNITHM code", () => {
    const icons = [
      ["icon_fullcombo", "comboStatus", "fc"],
      ["icon_alljustice", "comboStatus", "aj"],
      ["icon_alljusticecritical", "comboStatus", "ajc"],
      ["icon_fullchain2", "syncStatus", "full-chain"],
      ["icon_fullchain", "syncStatus", "full-chain-aj"],
      ["icon_clear", "clearStatus", "clear"],
      ["icon_hard", "clearStatus", "hard"],
      ["icon_brave", "clearStatus", "brave"],
      ["icon_absolute", "clearStatus", "absolute"],
      ["icon_catastrophy", "clearStatus", "catastrophy"],
    ] as const;
    for (const [icon, kind, key] of icons) {
      const html = `<div class="musiclist_box bg_master"><div class="music_title">Song</div>
        <div class="play_musicdata_highscore"><span class="text_b">1,000,000</span></div>
        <div class="play_musicdata_icon"><img src="/images/${icon}.png?ver=1"></div></div>`;
      const [score] = parseScores(html, { ...context, difficulty: codeOf("chunithm", "difficulty", "master") });
      expect(score[kind]).toBe(codeOf("chunithm", kind, key));
      expect(score.chart.chartType).toBe(codeOf("chunithm", "chartType", "standard"));
    }
  });

  it("lists the site difficulties in code order with their canonical codes", () => {
    expect(CHUNITHM_DIFFICULTIES.map(({ id, name }) => [id, name])).toEqual(
      (["basic", "advanced", "expert", "master", "ultima"] as const).map(name => [codeOf("chunithm", "difficulty", name), name]),
    );
  });

  it("recognizes the real subscription messages without matching ordinary subscription navigation", () => {
    const url = "https://new.chunithm-net.com/chuni-mobile/html/mobile/rightLimit/";
    expect(() => assertChunithmPage(`<div class="riyouken_block00"><div class="riyouken_attention">利用権が必要です。</div><p>利用権が無いため、サービスを<br>ご利用いただけません。</p></div>`, url)).toThrow("SUBSCRIPTION_REQUIRED");
    expect(() => assertChunithmPage('<a class="btn_standard_charge">利用権</a>', url)).not.toThrow();
  });

  it("reads decimal rating images and independent lifetime/current counts from playerData", () => {
    const html = `<div class="player_name_in">Player</div><div class="player_chara"><img src="/images/character.png"></div>
      <div class="player_honor_text">Title</div><div class="player_rating_num_block">
      ${["01", "05", "comma", "09", "02"].map(digit => `<img src="/rating/rating_orange_${digit}.png">`).join("")}</div>
      <div class="user_data_play_count"><div class="user_data_text">1,234</div></div>
      <div class="user_data_current_play_count"><div class="user_data_text">12</div></div>`;
    expect(parsePlayer(html, "https://new.chunithm-net.com/chuni-mobile/html/mobile/home/playerData")).toEqual({
      displayName: "Player", title: "Title", titleType: 0, rating: 1592,
      iconUrl: "https://new.chunithm-net.com/images/character.png", totalPlayCount: 1234, currentVersionPlayCount: 12,
    });
  });

  it("keeps recent selection fields, JST date and CHUNITHM percentages distinct from note counts", () => {
    const html = `<div class="frame02 w400"><div class="play_datalist_date">2026/09/27 16:05</div>
      <div class="play_track_text">TRACK 2</div><div class="play_track_result"><img src="/images/musiclevel_master.png"></div>
      <div class="play_musicdata_title">Recent song</div><div class="play_musicdata_score_text">1,002,000</div>
      <div class="play_musicdata_icon"><img src="/images/icon_fullcombo.png"></div>
      <form action="/record/playlog/sendPlaylogDetail/"><input type="hidden" name="idx" value="7"><input type="hidden" name="token" value="fresh"></form></div>`;
    const { rows: [result], skipped } = parseRecents(html, context);
    expect(skipped).toBe(0);
    expect(result.recent).toMatchObject({ playedAt: new Date("2026-09-27T07:05:00Z"), track: 2, scoreValue: 1002000, comboStatus: 1, chart: { difficulty: 3, version: 23 } });
    expect(result.form.action).toBe("/record/playlog/sendPlaylogDetail/");
    expect(Object.fromEntries(result.form.fields)).toEqual({ idx: "7", token: "fresh" });
    expect(() => parseRecents(html.replace('action="/record/playlog/sendPlaylogDetail/"', 'action=""'), context)).toThrow("Missing CHUNITHM navigation form");
    const playlog = parsePlaylog(`<div class="play_data_detail_maxcombo_block">1,234</div>
      <div class="play_data_detail_judge_text text_critical">1,200</div><div class="play_data_detail_judge_text text_justice">30</div>
      <div class="play_data_detail_judge_text text_attack">4</div><div class="play_data_detail_judge_text text_miss">0</div>
      ${["tap_red", "hold_yellow", "slide_blue", "air_green", "flick_skyblue"].map(note => `<div class="play_data_detail_notes_text text_${note}">101.00%</div>`).join("")}`);
    expect(playlog).toEqual({ maxCombo: 1234, judgments: { justiceCritical: 1200, justice: 30, attack: 4, miss: 0 }, notePercentages: { tap: 101, hold: 101, slide: 101, air: 101, flick: 101 } });
  });

  it("skips and counts plays of charts outside the fetched difficulties, such as WORLD'S END", () => {
    const row = (level: string, track: number) => `<div class="frame02 w400"><div class="play_datalist_date">2026/09/27 16:05</div>
      <div class="play_track_text">TRACK ${track}</div><div class="play_track_result"><img src="/images/musiclevel_${level}.png"></div>
      <div class="play_musicdata_title">Song ${track}</div><div class="play_musicdata_score_text">1,000,000</div>
      <form action="/record/playlog/sendPlaylogDetail/"><input type="hidden" name="idx" value="${track}"><input type="hidden" name="token" value="fresh"></form></div>`;
    const { rows, skipped } = parseRecents(row("worldsend", 1) + row("expert", 2), context);
    expect(skipped).toBe(1);
    expect(rows.map(({ recent }) => [recent.track, recent.chart.songName, recent.chart.difficulty])).toEqual([
      [2, "Song 2", codeOf("chunithm", "difficulty", "expert")],
    ]);
  });

  it("reads a playlog page without play rows as an empty history", () => {
    expect(parseRecents('<div class="box01"><div class="frame01 w460"><div class="box05">No plays</div></div></div>', context)).toEqual({ rows: [], skipped: 0 });
  });
});
