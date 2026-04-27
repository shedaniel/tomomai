import { fetchDivingFishRecordsByDevToken, type DivingFishIdentifier } from "../divingfish/client";
import type { ScoreData } from "../types";
import { parseDivingFishScoresData } from "./divingfish-parse";

export async function fetchDivingFishScoresData(
  identifier: DivingFishIdentifier,
): Promise<{ [difficulty: number]: ScoreData[] }> {
  const resp = await fetchDivingFishRecordsByDevToken(identifier);
  return parseDivingFishScoresData(resp.records);
}
