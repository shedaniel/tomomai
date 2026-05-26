import { value } from "@/server/utils/admin/type";
import { isNullish } from "utility-types";
import { levelToPrecise } from "@/server/utils/level";
import { SongFetcher } from "./fetcher-utils";

export const FillMissingFetcher: SongFetcher = async (context, songs) => {
  let missing = 0, mismatched = 0;
  const result = songs.map(song => {
    if (isNullish(value(song.levelPrecise))) {
      missing++;
      context.log.warn({ song }, `Level precise is missing for ${song.songName}@${song.type}@${song.difficulty}`);
      song = {
        ...song,
        levelPrecise: levelToPrecise(value(song.level), context.version)
      }
    }

    const level = value(song.level), levelPrecise = value(song.levelPrecise)!;
    const levelToPrecised = levelToPrecise(level, context.version);
    if (levelPrecise < levelToPrecised || levelPrecise > levelToPrecised + (levelToPrecised < 70 ? 9 : 5)) {
      mismatched++;
      context.log.warn({ song }, `Level precise is mismatched for ${song.songName}@${song.type}@${song.difficulty}`);
      song = {
        ...song,
        levelPrecise: levelToPrecise(level, context.version)
      }
    }

    return song;
  });
  context.notice.addDetail(`${missing} missing, ${mismatched} mismatched level precise values fixed`);
  return result;
};
