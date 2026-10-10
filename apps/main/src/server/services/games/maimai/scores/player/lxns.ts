import "server-only";
import { getLogger } from "@/lib/request-logger";
import { mirrorPlayerIcon } from "@/server/services/games/icons";
import { openPublicAssets } from "@/server/services/games/sega/http";
import type { PlayerData } from "../types";
import { parseLxnsPlayerData, unwrapLxnsPlayerResponse } from "./lxns-parse";

const LXNS_PLAYER_URL = "https://maimai.lxns.net/api/v0/user/maimai/player";

export class LxnsAuthRevokedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LxnsAuthRevokedError";
  }
}

export async function fetchLxnsPlayerData(accessToken: string, signal: AbortSignal): Promise<PlayerData> {
  const resp = await fetch(LXNS_PLAYER_URL, {
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
    throw new Error(`lxns player fetch failed: HTTP ${resp.status} ${errorText}`);
  }

  const json = (await resp.json()) as Record<string, unknown>;
  const { iconUpstreamUrl, ...player } = parseLxnsPlayerData(unwrapLxnsPlayerResponse(json));
  return { ...player, iconUrl: iconUpstreamUrl ? await mirrorLxnsIcon(iconUpstreamUrl, signal) : "" };
}

// A missing icon should not fail the whole fetch.
async function mirrorLxnsIcon(url: string, signal: AbortSignal): Promise<string> {
  try {
    return await mirrorPlayerIcon(openPublicAssets(signal), url, signal);
  } catch (err) {
    signal.throwIfAborted();
    getLogger().warn({ err, providerId: "lxns" }, "Could not mirror the player icon");
    return "";
  }
}
