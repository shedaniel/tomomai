import "server-only";
import { getLogger } from "@/lib/request-logger";
import { LxnsAuthRevokedError } from "../player/lxns";
import type { ScoreData } from "../types";
import { parseLxnsScoresData, unwrapLxnsScoresResponse } from "./lxns-parse";

const LXNS_SCORES_URL = "https://maimai.lxns.net/api/v0/user/maimai/player/scores";

export async function fetchLxnsScoresData(
  accessToken: string,
  signal: AbortSignal,
): Promise<ScoreData[]> {
  const resp = await fetch(LXNS_SCORES_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal,
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
  const parsed = parseLxnsScoresData(scores);
  getLogger().info({ providerId: "lxns", recordCount: scores.length, skipped: scores.length - parsed.length }, "Read lxns scores");
  return parsed;
}
