import { expect, it } from "vitest";
import { offersCapability } from "@/lib/games/capabilities";
import { CANONICAL_GAME_IDS } from "@/lib/games/ids";
import { getGame } from "@/lib/games/registry";
import { GAME_SERVER_MODULES } from "./registry";

it.each(CANONICAL_GAME_IDS)("serves reserved profiles for %s exactly when it declares reserved-accounts", game => {
  expect(Boolean(GAME_SERVER_MODULES[game].reserved)).toBe(offersCapability(getGame(game), "reserved-accounts"));
});
