import "server-only";
import { FETCH_STATES } from "@/lib/fetch-states";
import type { DivingFishToken } from "@/lib/games/token-format";
import type { FetchRun } from "@/server/services/games/fetch-run";
import { refuseToken } from "@/server/services/games/token-policy";
import type { ScoreFetchContext, ScoreFetchOutcome } from "@/server/services/games/types";
import { DivingFishPrivacyError, DivingFishUserNotFoundError, fetchDivingFishRecordsByDevToken } from "../divingfish/client";
import { normalizePlayer, normalizeScore } from "../normalize";
import { parseDivingFishPlayerData } from "../player/divingfish-parse";
import { parseDivingFishScoresData } from "../songs/divingfish-parse";

/** Reads the player and best scores diving-fish holds for the account. It has no recent plays, albums or events. */
export async function fetchFromDivingFish(ctx: ScoreFetchContext, token: DivingFishToken, run: FetchRun): Promise<ScoreFetchOutcome> {
  const { userId, region, signal } = ctx;
  const records = await run.stage("login", async () => {
    try {
      return await fetchDivingFishRecordsByDevToken(token.account, signal);
    } catch (error) {
      if (error instanceof DivingFishUserNotFoundError || error instanceof DivingFishPrivacyError) {
        return refuseToken("maimai", userId, region, "Session expired or invalid. Please provide a new token.");
      }
      throw error;
    }
  }, FETCH_STATES.LOGIN);
  const player = await run.stage("profile", async () => parseDivingFishPlayerData(records), FETCH_STATES.PLAYER_DATA);
  const scores = parseDivingFishScoresData(records.records);
  const recordCount = records.records?.length ?? 0;
  run.log.info({ providerId: "divingfish", recordCount, skipped: recordCount - scores.length }, "Read diving-fish scores");
  return {
    result: {
      player: normalizePlayer(player),
      scores: scores.map(score => normalizeScore(score, ctx)),
      recents: [],
      events: [],
    },
  };
}
