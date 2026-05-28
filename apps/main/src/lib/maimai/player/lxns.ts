import { logger } from "../../logger";
import type { PlayerData } from "../types";
import { parseLxnsPlayerData, unwrapLxnsPlayerResponse } from "./lxns-parse";

const LXNS_PLAYER_URL = "https://maimai.lxns.net/api/v0/user/maimai/player";

export class LxnsAuthRevokedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LxnsAuthRevokedError";
  }
}

export async function fetchLxnsPlayerData(accessToken: string): Promise<PlayerData> {
  logger.info("[lxns] fetching player data");

  const resp = await fetch(LXNS_PLAYER_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!resp.ok) {
    const errorText = (await resp.text().catch(() => "")).slice(0, 500);
    if (resp.status === 401 || resp.status === 403) {
      throw new LxnsAuthRevokedError(
        `lxns authorization revoked or expired (HTTP ${resp.status}). Please re-authorize. ${errorText}`,
      );
    }
    throw new Error(`lxns player fetch failed: HTTP ${resp.status} ${errorText}`);
  }

  const json = (await resp.json()) as Record<string, unknown>;
  const player = unwrapLxnsPlayerResponse(json);
  return parseLxnsPlayerData(player);
}
