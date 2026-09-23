import { resolveFlagsForUser } from "./flags";
import {
  getScoreFetchStatus,
  startScoreFetch,
  type ScoreFetchStatusResult,
  type StartScoreFetchResult,
} from "@/server/services/games/score-ingestion";
import type { Region } from "./types";

export type StartFetchResult = StartScoreFetchResult;
export type FetchStatusResult = ScoreFetchStatusResult;

export async function startMaimaiFetchServer(
  userId: string,
  region: Region,
  token?: string,
  options?: { skipAfter?: boolean },
): Promise<StartFetchResult> {
  const flags = await resolveFlagsForUser(userId);
  return startScoreFetch({
    userId,
    game: "maimai",
    region,
    token,
    flags,
    options,
  });
}

export async function getMaimaiFetchStatusServer(
  userId: string,
  region: Region,
): Promise<FetchStatusResult | null> {
  return getScoreFetchStatus({ userId, game: "maimai", region });
}

export const startFetchServer = startMaimaiFetchServer;
export const getFetchStatusServer = getMaimaiFetchStatusServer;
