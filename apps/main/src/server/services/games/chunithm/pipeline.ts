import "server-only";
import { FETCH_STATES, type FetchState } from "@/lib/fetch-states";
import { appendFetchState } from "@/lib/fetch-states-server";
import { GameAdapterError } from "@/lib/games/types";
import type { GameFetchResult, NormalizedRecent, NormalizedScore, ScoreFetchContext } from "@/server/services/games/types";
import { getLogger } from "@/lib/request-logger";
import { uploadIconToR2 } from "@/lib/r2";
import { gameSiteUrl, requestGamePage } from "../sega/http";
import { loginAndGetCookies } from "./login";
import { chunithmMobilePaths } from "./login-config";
import { assertChunithmPage, CHUNITHM_DIFFICULTIES, parseMusicGenreForm, parsePlayer, parseRecentDetails, parseRecents, parseScores } from "./parsers";

export async function fetchPlayer(ctx: ScoreFetchContext): Promise<GameFetchResult> {
  const { region, userId, token, sessionId, gameVersion, signal } = ctx;
  const log = getLogger().child({ game: "chunithm", region, userId, sessionId: sessionId.toString() });

  async function stage<T>(stepType: string, work: () => Promise<T>): Promise<T> {
    signal.throwIfAborted();
    const startedAt = Date.now();
    log.info({ stepType }, "Starting CHUNITHM fetch stage");
    try {
      const result = await work();
      signal.throwIfAborted();
      log.info({ stepType, durationMs: Date.now() - startedAt }, "Completed CHUNITHM fetch stage");
      return result;
    } catch (err) {
      log.error({ err, stepType, durationMs: Date.now() - startedAt }, "CHUNITHM fetch stage failed");
      throw err;
    }
  }
  if (region !== "jp" && region !== "intl") {
    throw new GameAdapterError("UNSUPPORTED_REGION", "CHUNITHM player fetching supports JP and International only", "chunithm", region, "scores");
  }
  const baseUrl = gameSiteUrl("chunithm", region, chunithmMobilePaths[region]);
  const session = { cookies: await stage("login", () => loginAndGetCookies(region, token, userId, signal)) };
  await appendFetchState(sessionId, FETCH_STATES.LOGIN, "chunithm");
  let referer = baseUrl.href;

  async function page(path: string, fields?: URLSearchParams) {
    const url = new URL(path, baseUrl).href;
    try {
      const response = await requestGamePage("chunithm", region, url, session, referer, fields ? {
        signal, method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: fields.toString(),
      } : { signal });
      if (response.status !== 200) throw new Error(`CHUNITHM page returned HTTP ${response.status}`);
      const html = await response.text();
      referer = response.url;
      assertChunithmPage(html, response.url);
      return html;
    } catch (err) {
      log.error({ err, path: new URL(url).pathname }, "CHUNITHM page request failed");
      throw err;
    }
  }

  const player = await stage("profile", async () => parsePlayer(await page("home/playerData"), referer));
  await appendFetchState(sessionId, FETCH_STATES.PLAYER_DATA, "chunithm");

  const scores = await stage("scores", async () => {
    const scores: NormalizedScore[] = [];
    let musicHtml = await page("record/musicGenre");
    // The selected difficulty and form token belong to the session, so requests must stay sequential.
    for (const difficulty of CHUNITHM_DIFFICULTIES) {
      const fields = parseMusicGenreForm(musicHtml);
      fields.set("genre", "99");
      musicHtml = await page(`record/musicGenre/send${difficulty.action}`, fields);
      scores.push(...parseScores(musicHtml, { region, gameVersion, difficulty: difficulty.id }));
      const state: FetchState = `song_data:${difficulty.name}`;
      await appendFetchState(sessionId, state, "chunithm");
    }
    return scores;
  });
  // TODO: Add WORLD'S END when its chart identity and catalog representation are supported.

  const recents = await stage("recents", async () => {
    const recentRows = parseRecents(await page("record/playlog"), { region, gameVersion });
    const recents: NormalizedRecent[] = [];
    log.info({ recordCount: recentRows.length }, "Fetching CHUNITHM recent details");
    for (const { recent, form } of recentRows) {
      const details = parseRecentDetails(await page(form.action, form.fields));
      recents.push({ ...recent, details: { ...recent.details, ...details } });
    }
    return recents;
  });
  await appendFetchState(sessionId, FETCH_STATES.RECENT_SONGS, "chunithm");

  const iconBytes = await stage("icon-download", async () => {
    const response = await requestGamePage("chunithm", region, player.iconUrl, session, referer, { signal });
    if (!response.ok) throw new Error(`CHUNITHM profile icon returned HTTP ${response.status}`);
    return { buffer: Buffer.from(await response.arrayBuffer()), contentType: response.headers.get("content-type") ?? "image/png" };
  });
  const icon = await stage("icon-upload", () => uploadIconToR2(iconBytes.buffer, iconBytes.contentType, signal));
  return { player: { ...player, iconUrl: icon.url }, scores, recents };
}
