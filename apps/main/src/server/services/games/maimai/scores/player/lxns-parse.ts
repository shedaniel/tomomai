import { MAIMAI_CODES } from "@/lib/games/maimai/codes";
import type { TitleType } from "@/lib/games/maimai/types";
import type { ParsedPlayerData } from "../types";

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

export function parseLxnsPlayerData(player: LxnsPlayerResponse): ParsedPlayerData {
  const iconId = player.icon?.id;

  const courseRank = player.course_rank ?? 0;
  const classRank = player.class_rank ?? 0;
  const courseRankUrl = `${PROBER_ASSETS_BASE}/course_rank/${courseRank}.webp`;
  const classRankUrl = `${PROBER_ASSETS_BASE}/class_rank/${classRank}.webp`;

  const trophyColor = player.trophy?.color;
  const titleType: TitleType = (MAIMAI_CODES.titleType as readonly string[]).includes(trophyColor ?? "")
    ? (trophyColor as TitleType)
    : "normal";

  return {
    iconUpstreamUrl: iconId ? `${LXNS_ICON_BASE}/${iconId}.png` : "",
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
