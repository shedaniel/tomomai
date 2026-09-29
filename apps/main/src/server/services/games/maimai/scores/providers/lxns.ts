import "server-only";
import { FETCH_STATES } from "@/lib/fetch-states";
import type { LxnsToken } from "@/lib/games/token-format";
import type { FetchRun } from "@/server/services/games/fetch-run";
import { refuseToken } from "@/server/services/games/token-policy";
import type { ScoreFetchContext, ScoreFetchOutcome } from "@/server/services/games/types";
import { lxnsAccessToken } from "../../login";
import { normalizePlayer, normalizeScore } from "../normalize";
import { fetchLxnsPlayerData, LxnsAuthRevokedError } from "../player/lxns";
import { fetchLxnsScoresData } from "../songs/lxns";

/** Reads the player and best scores the lxns prober holds. It has no recent plays, albums or events. */
export async function fetchFromLxns(ctx: ScoreFetchContext, token: LxnsToken, run: FetchRun): Promise<ScoreFetchOutcome> {
  const { userId, region, signal } = ctx;
  const accessToken = await run.stage("login", () => lxnsAccessToken(userId, region, token, signal), FETCH_STATES.LOGIN);
  try {
    const [player, scores] = await Promise.all([
      run.stage("profile", () => fetchLxnsPlayerData(accessToken, signal), FETCH_STATES.PLAYER_DATA),
      run.stage("scores", () => fetchLxnsScoresData(accessToken, signal)),
    ]);
    return { result: { player: normalizePlayer(player), scores: scores.map(score => normalizeScore(score, ctx)), recents: [], events: [] } };
  } catch (error) {
    if (error instanceof LxnsAuthRevokedError) return refuseToken("maimai", userId, region, "Session expired or invalid. Please provide a new token.");
    throw error;
  }
}
