import { TITLE_TYPE_ENUM } from "../../db/types";
import { logger } from "../../logger";
import type { TitleType } from "../../types";
import type { PlayerData } from "../types";

const LXNS_ICON_BASE = "https://assets2.lxns.net/maimai/icon";
const PROBER_ASSETS_BASE = "https://maimai.lxns.net/assets/maimai";

export interface LxnsPlayerResponse {
  name?: string;
  rating?: number;
  star?: number;
  course_rank?: number;
  class_rank?: number;
  trophy?: { id?: number; name?: string; color?: string };
  icon?: { id?: number };
}

export function unwrapLxnsPlayerResponse(json: Record<string, unknown>): LxnsPlayerResponse {
  return ((json.data as LxnsPlayerResponse | undefined) ?? (json as LxnsPlayerResponse)) ?? {};
}

export async function parseLxnsPlayerData(player: LxnsPlayerResponse): Promise<PlayerData> {
  const iconId = player.icon?.id;
  const iconUrl = iconId ? `${LXNS_ICON_BASE}/${iconId}.png` : "";
  const fetched = iconUrl ? await fetchIconAsBytes(iconUrl) : null;

  const courseRank = player.course_rank ?? 0;
  const classRank = player.class_rank ?? 0;
  const courseRankUrl = `${PROBER_ASSETS_BASE}/course_rank/${courseRank}.webp`;
  const classRankUrl = `${PROBER_ASSETS_BASE}/class_rank/${classRank}.webp`;

  const trophyColor = player.trophy?.color;
  const titleType: TitleType = (TITLE_TYPE_ENUM as readonly string[]).includes(trophyColor ?? "")
    ? (trophyColor as TitleType)
    : "normal";

  return {
    iconBytes: fetched?.buffer ?? null,
    iconContentType: fetched?.contentType ?? null,
    displayName: player.name ?? "",
    rating: player.rating ?? 0,
    title: player.trophy?.name ?? "",
    titleType,
    stars: player.star ?? 0,
    versionPlayCount: -1,
    totalPlayCount: -1,
    courseRankUrl,
    classRankUrl,
  };
}

async function fetchIconAsBytes(
  imageUrl: string,
): Promise<{ buffer: Buffer; contentType: string } | null> {
  const resp = await fetch(imageUrl);
  if (!resp.ok) {
    logger.warn(`[lxns] failed to fetch image ${imageUrl}: HTTP ${resp.status}`);
    return null;
  }
  const buffer = Buffer.from(await resp.arrayBuffer());
  const contentType = resp.headers.get("content-type") || "image/png";
  return { buffer, contentType };
}
