import { describe, expect, it } from "vitest";
import { assertChunithmPage, parseMusicGenreForm, parseScores } from "./parsers";

const context = { region: "jp" as const, gameVersion: 23 };

describe("CHUNITHM records", () => {
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

  it("recognizes the real subscription messages without matching ordinary subscription navigation", () => {
    const url = "https://new.chunithm-net.com/chuni-mobile/html/mobile/rightLimit/";
    expect(() => assertChunithmPage(`<div class="riyouken_block00"><div class="riyouken_attention">利用権が必要です。</div><p>利用権が無いため、サービスを<br>ご利用いただけません。</p></div>`, url)).toThrow("SUBSCRIPTION_REQUIRED");
    expect(() => assertChunithmPage('<a class="btn_standard_charge">利用権</a>', url)).not.toThrow();
  });
});
