import { fetchDivingFishRecordsByDevToken, type DivingFishIdentifier } from "../divingfish/client";
import type { PlayerData } from "../types";
import { parseDivingFishPlayerData } from "./divingfish-parse";

export async function fetchDivingFishPlayerData(
  identifier: DivingFishIdentifier,
): Promise<PlayerData> {
  const resp = await fetchDivingFishRecordsByDevToken(identifier);
  return parseDivingFishPlayerData(resp);
}
