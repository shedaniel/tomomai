import type { DivingFishRecordsResponse } from "../divingfish/client";
import type { PlayerData } from "../types";

const COURSE_RANK_BASE = "https://maimai.lxns.net/assets/maimai/course_rank";

export function parseDivingFishPlayerData(resp: DivingFishRecordsResponse): PlayerData {
  const additionalRating = resp.additional_rating ?? 0;
  const courseRankUrl =
    additionalRating > 0 ? `${COURSE_RANK_BASE}/${additionalRating}.webp` : "";

  return {
    iconUrl: "",
    iconBase64: "",
    displayName: resp.nickname ?? "",
    rating: resp.rating ?? 0,
    title: resp.plate ?? "",
    titleType: "normal",
    stars: 0,
    versionPlayCount: -1,
    totalPlayCount: -1,
    courseRankUrl,
    classRankUrl: "",
  };
}
