import "server-only";
import { FETCH_STATES, type FetchState } from "@/lib/fetch-states";
import { appendFetchState } from "@/lib/fetch-states-server";
import { GameAdapterError, type GameFetchResult, type NormalizedRecent, type NormalizedScore, type ScoreFetchContext } from "@/lib/games/types";
import { uploadIconToR2 } from "@/lib/r2";
import { gameSiteUrl, requestGamePage } from "../sega/http";
import { loginAndGetCookies } from "./login";
import { chunithmMobilePaths } from "./login-config";
import { assertChunithmPage, CHUNITHM_DIFFICULTIES, parseMusicGenreForm, parsePlayer, parseRecentDetails, parseRecents, parseScores } from "./parsers";

const difficultyStates: Record<number, FetchState> = {
  0: FETCH_STATES.SONG_DATA_BASIC,
  1: FETCH_STATES.SONG_DATA_ADVANCED,
  2: FETCH_STATES.SONG_DATA_EXPERT,
  3: FETCH_STATES.SONG_DATA_MASTER,
  4: FETCH_STATES.SONG_DATA_ULTIMA,
};

export async function fetchPlayer(ctx: ScoreFetchContext): Promise<GameFetchResult> {
  const { region, userId, token, sessionId, gameVersion } = ctx;
  if (region !== "jp" && region !== "intl") {
    throw new GameAdapterError("UNSUPPORTED_REGION", "CHUNITHM player fetching supports JP and International only", "chunithm", region, "scores");
  }
  const baseUrl = gameSiteUrl("chunithm", region, chunithmMobilePaths[region]);
  const session = { cookies: await loginAndGetCookies(region, token, userId) };
  await appendFetchState(sessionId, FETCH_STATES.LOGIN, "chunithm");
  let referer = baseUrl.href;

  async function page(path: string, fields?: URLSearchParams) {
    const url = new URL(path, baseUrl).href;
    const response = await requestGamePage("chunithm", region, url, session, referer, fields ? {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: fields.toString(),
    } : undefined);
    if (response.status !== 200) throw new Error(`CHUNITHM page returned HTTP ${response.status}`);
    const html = await response.text();
    referer = response.url;
    assertChunithmPage(html, response.url);
    return html;
  }

  const player = parsePlayer(await page("home/playerData"), referer);
  await appendFetchState(sessionId, FETCH_STATES.PLAYER_DATA, "chunithm");

  const scores: NormalizedScore[] = [];
  let musicHtml = await page("record/musicGenre");
  // The selected difficulty and form token belong to the session, so requests must stay sequential.
  for (const difficulty of CHUNITHM_DIFFICULTIES) {
    const fields = parseMusicGenreForm(musicHtml);
    fields.set("genre", "99");
    musicHtml = await page(`record/musicGenre/send${difficulty.action}`, fields);
    scores.push(...parseScores(musicHtml, { region, gameVersion, difficulty: difficulty.id }));
    await appendFetchState(sessionId, difficultyStates[difficulty.id], "chunithm");
  }
  // TODO: Add WORLD'S END when its chart identity and catalog representation are supported.

  const recentRows = parseRecents(await page("record/playlog"), { region, gameVersion });
  const recents: NormalizedRecent[] = [];
  for (const { recent, form } of recentRows) {
    const details = parseRecentDetails(await page(form.action, form.fields));
    recents.push({ ...recent, details: { ...recent.details, ...details } });
  }
  await appendFetchState(sessionId, FETCH_STATES.RECENT_SONGS, "chunithm");

  const iconResponse = await requestGamePage("chunithm", region, player.iconUrl, session, referer);
  if (!iconResponse.ok) throw new Error(`CHUNITHM profile icon returned HTTP ${iconResponse.status}`);
  const icon = await uploadIconToR2(Buffer.from(await iconResponse.arrayBuffer()), iconResponse.headers.get("content-type") ?? "image/png");
  return { player: { ...player, iconUrl: icon.url }, scores, recents };
}
