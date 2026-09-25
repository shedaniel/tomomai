import { value } from "@/server/utils/admin/type";
import { fillMissingCatalogLevel } from "@/lib/games/catalog-levels";
import { SongFetcher } from "./fetcher-utils";

export const FillMissingFetcher: SongFetcher = async (context, songs) => {
  let missing = 0, mismatched = 0;
  const result = songs.map(song => {
    const songKey = `${song.songName}@${song.type}@${song.difficulty}`;
    const filled = fillMissingCatalogLevel(value(song.level), value(song.levelPrecise), {
      plusOffset: context.version >= 9 ? 6 : 7,
      mismatchUpperOffset: minimum => minimum < 70 ? 9 : 5,
    });
    if (filled.reason === "missing") {
      missing++;
      context.log.warn({ songKey }, "Level precise is missing");
    }
    if (filled.reason === "mismatched") {
      mismatched++;
      context.log.warn({ songKey }, "Level precise is mismatched");
    }
    return {
      ...song,
      levelPrecise: filled.reason ? filled.levelPrecise ?? undefined : song.levelPrecise,
      metadata: { ...song.metadata, levelPreciseEstimated: filled.estimated || song.metadata?.levelPreciseEstimated === true },
    };
  });
  context.notice.addDetail(`${missing} missing, ${mismatched} mismatched level precise values fixed`);
  return result;
};
