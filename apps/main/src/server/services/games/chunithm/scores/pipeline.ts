import "server-only";
import { FETCH_STATES, songDataState } from "@/lib/fetch-states";
import { appendFetchState } from "@/lib/fetch-states-server";
import type { GameFetchResult, NormalizedRecent, NormalizedScore, ScoreFetchContext } from "@/server/services/games/types";
import { getLogger } from "@/lib/request-logger";
import { mirrorPlayerIcon } from "@/server/services/games/icons";
import { openGameSite } from "@/server/services/games/sega/http";
import { loginAndGetCookies } from "../login";
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

  const cookies = await stage("login", () => loginAndGetCookies(region, token, userId, signal));
  await appendFetchState(sessionId, FETCH_STATES.LOGIN, "chunithm");
  const site = openGameSite("chunithm", region, { cookies }, { signal, assertPage: assertChunithmPage });

  const player = await stage("profile", async () => parsePlayer(await site.html("home/playerData"), site.pageUrl));
  await appendFetchState(sessionId, FETCH_STATES.PLAYER_DATA, "chunithm");

  const scores = await stage("scores", async () => {
    const scores: NormalizedScore[] = [];
    let musicHtml = await site.html("record/musicGenre");
    // The selected difficulty and form token belong to the session, so requests must stay sequential.
    for (const difficulty of CHUNITHM_DIFFICULTIES) {
      const fields = parseMusicGenreForm(musicHtml);
      fields.set("genre", "99");
      musicHtml = await site.post(`record/musicGenre/send${difficulty.action}`, fields);
      scores.push(...parseScores(musicHtml, { region, gameVersion, difficulty: difficulty.id }));
      await appendFetchState(sessionId, songDataState("chunithm", difficulty.id), "chunithm");
    }
    return scores;
  });
  // TODO: Add WORLD'S END when its chart identity and catalog representation are supported.

  const recents = await stage("recents", async () => {
    const { rows, skipped } = parseRecents(await site.html("record/playlog"), { region, gameVersion });
    const recents: NormalizedRecent[] = [];
    log.info({ recordCount: rows.length, skipped }, "Fetching CHUNITHM recent details");
    for (const { recent, form } of rows) {
      const details = parseRecentDetails(await site.post(form.action, form.fields));
      recents.push({ ...recent, details: { ...recent.details, ...details } });
    }
    return recents;
  });
  await appendFetchState(sessionId, FETCH_STATES.RECENT_SONGS, "chunithm");

  const iconUrl = await stage("icon", () => mirrorPlayerIcon(site, player.iconUrl, signal));
  return { player: { ...player, iconUrl }, scores, recents };
}
