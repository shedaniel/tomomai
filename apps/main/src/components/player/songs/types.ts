import type { GamePlayerScore } from "@/lib/games/player-view";

export type DisplayScore = Pick<GamePlayerScore, "songId" | "songName" | "artist" | "cover" | "difficultyCode" | "typeCode" | "levelPrecise" | "scoreValue" | "secondaryScore" | "comboStatus" | "syncStatus" | "clearStatus">;
export type RatedScore = GamePlayerScore & { rating: number };
