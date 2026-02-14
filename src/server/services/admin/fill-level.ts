import { value } from "@/server/utils/admin/type";
import { SongFetcher } from "./level-fetcher";
import { isNullish } from "utility-types";
import { levelToPrecise } from "@/server/utils/level";

export const FillLevelPreciseFetcher: SongFetcher = async (context, songs) => {
  return songs.map(song => {
    if (isNullish(value(song.levelPrecise))) {
      context.log.warn({ song }, `Level precise is missing for ${song.songName}@${song.type}@${song.difficulty}`);
      song = {
        ...song,
        levelPrecise: levelToPrecise(value(song.level), context.version)
      }
    }

    const level = value(song.level), levelPrecise = value(song.levelPrecise)!;
    const levelToPrecised = levelToPrecise(level, context.version);
    if (levelPrecise < levelToPrecised || levelPrecise > levelToPrecised + (levelToPrecised < 70 ? 9 : 5)) {
      context.log.warn({ song }, `Level precise is mismatched for ${song.songName}@${song.type}@${song.difficulty}`);
      song = {
        ...song,
        levelPrecise: levelToPrecise(level, context.version)
      }
    }

    return song;
  })
};
