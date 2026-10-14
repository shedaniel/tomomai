import { GAME_CODES } from "@/lib/games/codes";
import { definePublicGameHandler } from "@/lib/api/route";
import { spec } from "./spec";

export const GET = definePublicGameHandler(spec, async ({ game }) => GAME_CODES[game]);
