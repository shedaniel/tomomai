import "server-only";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import type { Logger } from "pino";
import { db } from "@/lib/db";
import { userRecentSongs } from "@/lib/db/schema-pg";
import { FETCH_STATES, songDataState } from "@/lib/fetch-states";
import type { FetchRun } from "@/server/services/games/fetch-run";
import { mirrorPlayerIcon } from "@/server/services/games/icons";
import { chartKey } from "@/server/services/games/score-storage";
import { openGameSite, type GameSiteClient } from "@/server/services/games/sega/http";
import type { Enrichment, NormalizedScore, ScoreFetchContext, ScoreFetchOutcome } from "@/server/services/games/types";
import { loginAndGetCookies } from "../login";
import { assertChunithmPage, CHUNITHM_DIFFICULTIES, parseMusicGenreForm, parsePlayer, parseRecentDetails, parseRecents, parseScores, type ChunithmRecentRow } from "./parsers";

export async function fetchChunithmScores(ctx: ScoreFetchContext, run: FetchRun): Promise<ScoreFetchOutcome> {
  const { region, userId, token, gameVersion, signal } = ctx;

  const cookies = await run.stage("login", () => loginAndGetCookies(region, token, userId, signal), FETCH_STATES.LOGIN);
  const site = openGameSite("chunithm", region, { cookies }, { signal, assertPage: assertChunithmPage });

  const player = await run.stage("profile", async () => parsePlayer(await site.html("home/playerData"), site.pageUrl), FETCH_STATES.PLAYER_DATA);

  // The selected difficulty and form token belong to the session, so requests must stay sequential.
  let musicHtml = await run.stage("scores", () => site.html("record/musicGenre"));
  const scores: NormalizedScore[] = [];
  for (const difficulty of CHUNITHM_DIFFICULTIES) {
    const state = songDataState("chunithm", difficulty.id);
    musicHtml = await run.stage(state, async () => {
      const fields = parseMusicGenreForm(musicHtml);
      fields.set("genre", "99");
      const html = await site.post(`record/musicGenre/send${difficulty.action}`, fields);
      scores.push(...parseScores(html, { region, gameVersion, difficulty: difficulty.id }));
      return html;
    }, state);
  }
  // TODO: Add WORLD'S END when its chart identity and catalog representation are supported.

  const plays = await run.stage("recents", async () => {
    const { rows, skipped } = parseRecents(await site.html("record/playlog"), { region, gameVersion });
    run.log.info({ recordCount: rows.length, skipped }, "Read CHUNITHM recent plays");
    return rows;
  }, FETCH_STATES.RECENT_SONGS);

  const iconUrl = await run.stage("icon", () => mirrorPlayerIcon(site, player.iconUrl, signal));
  return {
    result: { player: { ...player, iconUrl }, scores, recents: plays.map(play => play.recent) },
    enrich: plays.length > 0 ? recentDetails(site, plays, run.log) : undefined,
  };
}

/**
 * Stores each new play's detail page as its recent row's metadata. A detail is a selector POST that the
 * session redirects to the detail page, so plays are read one at a time, and a play that fails is skipped.
 */
function recentDetails(site: GameSiteClient, plays: readonly ChunithmRecentRow[], log: Logger): Enrichment {
  return async persisted => {
    const detailed = await db
      .select({ songId: userRecentSongs.songId, playedAt: userRecentSongs.playedAt })
      .from(userRecentSongs)
      .where(and(
        eq(userRecentSongs.userId, persisted.userId),
        eq(userRecentSongs.game, "chunithm"),
        inArray(userRecentSongs.playedAt, plays.map(play => play.recent.playedAt)),
        isNotNull(userRecentSongs.metadata),
      ));
    const playKey = (songId: bigint, playedAt: Date) => `${songId}@${playedAt.getTime()}`;
    const done = new Set(detailed.map(row => playKey(row.songId, row.playedAt)));
    const pending = plays.flatMap(({ recent, form }) => {
      const songId = persisted.chartResolution.get(chartKey(recent.chart));
      return songId === undefined || done.has(playKey(songId, recent.playedAt)) ? [] : [{ songId, playedAt: recent.playedAt, form }];
    });

    let errorCount = 0;
    for (const { songId, playedAt, form } of pending) {
      try {
        const details = parseRecentDetails(await site.post(form.action, form.fields));
        await db
          .update(userRecentSongs)
          .set({ metadata: details })
          .where(and(
            eq(userRecentSongs.userId, persisted.userId),
            eq(userRecentSongs.game, "chunithm"),
            eq(userRecentSongs.songId, songId),
            eq(userRecentSongs.playedAt, playedAt),
          ));
      } catch (err) {
        errorCount++;
        log.warn({ err }, "Could not read a CHUNITHM recent play's details");
      }
    }
    log.info({ recordCount: pending.length, skipped: plays.length - pending.length, errorCount }, "Read CHUNITHM recent play details");
  };
}
