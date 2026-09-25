import { chartTypeToCode, difficultyToCode } from "@/lib/maimai/codes";
import { fetchLevels, getFetchersForRegion } from "@/server/services/admin/level-fetcher";
import type { VersionId } from "@/lib/metadata";
import type { UpdateSong } from "@/lib/types/update";
import type { Logger } from "pino";
import { getCurrentVersion } from "../../versions";
import type { CatalogFetchContext, PendingChart } from "../../catalog-types";
import type { CatalogSourceAdapter } from "../../types";

export function toPendingChart(song: UpdateSong): PendingChart {
  return {
    game: "maimai",
    songName: song.songName,
    chartType: chartTypeToCode(song.type),
    difficulty: difficultyToCode(song.difficulty),
    artist: song.artist,
    cover: song.cover,
    level: song.level,
    levelPrecise: song.levelPrecise,
    genre: song.genre,
    addedVersion: song.addedVersion,
    bpm: song.bpm === null ? undefined : song.bpm,
    noteDesigner: song.noteDesigner === null ? undefined : song.noteDesigner,
    noteCounts: song.noteCounts === null ? undefined : song.noteCounts,
  };
}

export const maimaiCatalogAdapter: CatalogSourceAdapter = {
  configured: true,
  requiresToken: region => region !== "cn",
  async authenticate(region, token) {
    if (region === "cn") return "";
    const { loginAndGetCookies } = await import("@/server/services/maimai-login");
    return loginAndGetCookies(region, token);
  },
  getStages(region) {
    return { names: [...getFetchersForRegion(region).names] };
  },
  resolveVersion(region) {
    return getCurrentVersion("maimai", region);
  },
  async collect(ctx: CatalogFetchContext) {
    const songs = await fetchLevels({
      region: ctx.region,
      version: ctx.version as VersionId,
      cookies: ctx.cookies ?? "",
      forceMode: ctx.forceMode,
      log: ctx.log as unknown as Logger,
      notice: ctx.notice,
    });
    return songs.map(toPendingChart);
  },
};
