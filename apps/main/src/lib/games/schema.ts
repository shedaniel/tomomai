import { z } from "zod";
import { CANONICAL_GAME_IDS } from "./types";

export const gameIdSchema = z.enum(CANONICAL_GAME_IDS);
export const maimaiCompatibilityGameSchema = gameIdSchema.refine(game => game === "maimai", "This feature is only available for maimai");
