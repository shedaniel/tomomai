import { getAvailableVersions, getCurrentVersion } from "@/lib/games/versions";
import { definePublicGameHandler } from "@/lib/api/route";
import { spec } from "./spec";

export const GET = definePublicGameHandler(spec, async ({ game, query: { region } }) => ({
  currentVersion: getCurrentVersion(game, region),
  versions: getAvailableVersions(game, region).map(({ id, name }) => ({ id, name })),
}));
