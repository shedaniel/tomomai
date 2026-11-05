import "server-only";
import { logger } from "@/lib/logger";
import { FETCH_STATES, songDataState } from "@/lib/fetch-states";
import { MAIMAI_CODES } from "@/lib/games/maimai/codes";
import type { CnCookiesToken, SegaToken } from "@/lib/games/token-format";
import type { FetchRun } from "@/server/services/games/fetch-run";
import { mirrorPlayerIcon } from "@/server/services/games/icons";
import { openGameSite, releaseGameSiteSession, type GameSiteClient, type GameSiteSession } from "@/server/services/games/sega/http";
import { openSegaSession } from "@/server/services/games/sega/login";
import { friendSyncDue, savePlayerFriends } from "@/server/services/friends/sync";
import type { Enrichment, PersistedSnapshotContext, ScoreFetchContext, ScoreFetchOutcome } from "@/server/services/games/types";
import { fetchAlbumData } from "../albums/fetch";
import { persistAlbumData } from "../albums/persist";
import { fetchEventsData } from "../events/fetch";
import { fetchFriendData } from "../friends/fetch";
import { normalizeEvents, normalizePlayer, normalizeRecent, normalizeScore } from "../normalize";
import { assertMaimaiPage } from "../parse-utils";
import { parsePlayerData } from "../player/parse";
import { fetchAndInsertRecentSongsData } from "../recents/details";
import { fetchRecentSongsData } from "../recents/fetch";
import { fetchHiddenSongsData, fetchSongsData } from "../songs/fetch";
import type { AlbumData, RecentSongData } from "../types";

/** Scrapes maimai DX NET after signing in with SEGA. */
export function fetchWithSegaLogin(ctx: ScoreFetchContext, token: SegaToken, run: FetchRun): Promise<ScoreFetchOutcome> {
  return scrapeMaimaiNet(ctx, run, () => openSegaSession("maimai", ctx.region, ctx.userId, token, ctx.signal));
}

/** Scrapes maimai DX China with the session the CN proxy captured. */
export function fetchWithCnCookies(ctx: ScoreFetchContext, token: CnCookiesToken, run: FetchRun): Promise<ScoreFetchOutcome> {
  return scrapeMaimaiNet(ctx, run, async () => ({ cookies: token.cookies }));
}

async function scrapeMaimaiNet(ctx: ScoreFetchContext, run: FetchRun, signIn: () => Promise<GameSiteSession>): Promise<ScoreFetchOutcome> {
  const { region, signal } = ctx;
  const session = await run.stage("login", signIn, FETCH_STATES.LOGIN);
  // Recent play details and album photos are read through the session after the snapshot is saved.
  run.defer(() => releaseGameSiteSession(session));
  const site = openGameSite("maimai", region, session, { signal, assertPage: assertMaimaiPage });

  // One page first, so an expired session fails before the concurrent reads start.
  const { iconUpstreamUrl, ...player } = await run.stage("profile", async () => parsePlayerData(await site.html("playerData/"), region));
  const [iconUrl, scoreLists, recents, albums] = await Promise.all([
    run.stage("icon", () => mirrorPlayerIcon(site, iconUpstreamUrl, signal), FETCH_STATES.PLAYER_DATA),
    Promise.all(MAIMAI_CODES.difficulty.map((difficulty, code) => {
      const state = songDataState("maimai", code);
      return run.stage(state, () => fetchSongsData(site, difficulty), state);
    })),
    run.stage("recents", () => fetchRecentSongsData(site), FETCH_STATES.RECENT_SONGS),
    run.stage("albums", async () => ctx.shouldFetchAlbums ? fetchAlbumData(site, region) : [], FETCH_STATES.ALBUM_DATA),
  ]);
  const scores = scoreLists.flat();

  const hiddenScores = await run.stage("hiddenSongs", async () => {
    if (region !== "intl") return [];
    try {
      return await fetchHiddenSongsData(site, scores);
    } catch (err) {
      signal.throwIfAborted();
      logger.warn({ err }, "Continuing without maimai hidden songs");
      return [];
    }
  }, FETCH_STATES.HIDDEN_SONGS);

  const events = ctx.flags.eventsCard
    ? await run.stage("events", async () => {
      try {
        return await fetchEventsData(site, region);
      } catch (err) {
        signal.throwIfAborted();
        logger.warn({ err }, "Continuing without maimai events");
        return null;
      }
    })
    : null;

  return {
    result: {
      player: normalizePlayer({ ...player, iconUrl }),
      scores: [...scores, ...hiddenScores].map(score => normalizeScore(score, ctx)),
      recents: recents.map(recent => normalizeRecent(recent, ctx)),
      events: events ? normalizeEvents(events) : [],
    },
    enrich: completeSnapshot(ctx, site, recents, albums),
  };
}

/** Saves each recent play's detail page, the album photos and the friend list through the same site session. */
function completeSnapshot(ctx: ScoreFetchContext, site: GameSiteClient, recents: RecentSongData[], albums: AlbumData[]): Enrichment | undefined {
  const { friends } = ctx.flags;
  if (recents.length === 0 && albums.length === 0 && !friends) return undefined;
  return async persisted => {
    const [details, photos, friendList] = await Promise.allSettled([
      fetchAndInsertRecentSongsData(persisted.userId, persisted.region, site, recents),
      persistAlbumData(persisted.userId, persisted.chartResolution, albums, async album => (await site.bytes(album.imageUrl)).buffer),
      friends ? syncFriends(site, persisted) : undefined,
    ]);
    if (details.status === "rejected") logger.error({ err: details.reason, stepType: "recentDetails" }, "Could not save maimai recent play details");
    if (photos.status === "rejected") logger.error({ err: photos.reason, stepType: "albums" }, "Could not save maimai album photos");
    if (friendList.status === "rejected") logger.error({ err: friendList.reason, stepType: "friends" }, "Could not save maimai friends");
  };
}

async function syncFriends(site: GameSiteClient, { userId, game, region }: PersistedSnapshotContext): Promise<void> {
  if (!await friendSyncDue(userId, game, region)) return;
  const data = await fetchFriendData(site, region);
  if (data) await savePlayerFriends({ userId, game, region, ...data });
}
