import { logger } from "../../logger";
import { LxnsAuthRevokedError } from "../player/lxns";
import type { ScoreData } from "../types";
import { parseLxnsScoresData, unwrapLxnsScoresResponse } from "./lxns-parse";

const LXNS_SCORES_URL = "https://maimai.lxns.net/api/v0/user/maimai/player/scores";

export async function fetchLxnsScoresData(
  accessToken: string,
): Promise<{ [difficulty: number]: ScoreData[] }> {
  logger.info("[lxns] fetching scores");

  const resp = await fetch(LXNS_SCORES_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!resp.ok) {
    const errorText = (await resp.text().catch(() => "")).slice(0, 500);
    if (resp.status === 401 || resp.status === 403) {
      throw new LxnsAuthRevokedError(
        `lxns authorization revoked or expired (HTTP ${resp.status}). Please re-authorize. ${errorText}`,
      );
    }
    throw new Error(`lxns scores fetch failed: HTTP ${resp.status} ${errorText}`);
  }

  const json = (await resp.json()) as Record<string, unknown>;
  const scores = unwrapLxnsScoresResponse(json);
  logger.info(`[lxns] received ${scores.length} scores`);
  return parseLxnsScoresData(scores);
}
