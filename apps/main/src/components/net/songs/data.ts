import { parentPublicIdOf } from "@tomomai/games/song-ids";
import type { UniqueSong } from "@/components/db/songs/types";
import { codeOf, isCodeKey } from "@/lib/games/codes";
import type { GamePlayerScore } from "@/lib/games/player-view";

/** [difficultyCode, level, scoreValue, dxScore, comboStatus, syncStatus]. Tuples keep thousands of charts small on the wire. */
export type NetSongChart = [number, string, number | null, number | null, number, number];

export type NetSong = {
  /** A parent public id of one of the song's charts, which opens the song page. */
  id: string;
  name: string;
  genre: string;
  version: number;
  typeCode: number;
  /** Catalog order, the order DX NET lists songs in within a genre. */
  order: number;
  charts: NetSongChart[];
};

export type NetChartEntry = { song: NetSong; chart: NetSongChart };

function chartKey(songName: string, artist: string, typeCode: number, difficultyCode: number): string {
  return `${songName}\u0000${artist}\u0000${typeCode}\u0000${difficultyCode}`;
}

function toChart(difficultyCode: number, level: string, score: GamePlayerScore | undefined): NetSongChart {
  return score
    ? [difficultyCode, level, score.scoreValue, score.secondaryScore, score.comboStatus, score.syncStatus]
    : [difficultyCode, level, null, null, 0, 0];
}

/**
 * The catalog's charts up to the snapshot's version, each with the player's score when they have one. Scores the
 * catalog does not know still show, after the catalog's songs.
 */
export function buildNetSongs(catalog: readonly UniqueSong[], scores: readonly GamePlayerScore[], gameVersion: number): NetSong[] {
  const byChart = new Map(scores.map(score => [chartKey(score.songName, score.artist, score.typeCode, score.difficultyCode), score]));
  const songs: NetSong[] = [];

  for (const song of catalog) {
    if (song.addedVersion > gameVersion || !isCodeKey("maimai", "chartType", song.type)) continue;
    const typeCode = codeOf("maimai", "chartType", song.type);
    const charts = song.difficulties.flatMap(chart => {
      if (!isCodeKey("maimai", "difficulty", chart.difficulty)) return [];
      const difficultyCode = codeOf("maimai", "difficulty", chart.difficulty);
      const key = chartKey(song.songName, song.artist, typeCode, difficultyCode);
      const score = byChart.get(key);
      byChart.delete(key);
      return [toChart(difficultyCode, chart.level, score)];
    });
    if (charts.length) songs.push({ id: song.parentIds[0], name: song.songName, genre: song.genre, version: song.addedVersion, typeCode, order: song.index, charts });
  }

  const orphans = new Map<string, NetSong>();
  for (const score of byChart.values()) {
    const key = chartKey(score.songName, score.artist, score.typeCode, -1);
    let song = orphans.get(key);
    if (!song) {
      song = { id: parentPublicIdOf(score.songId), name: score.songName, genre: score.genre, version: score.addedVersion, typeCode: score.typeCode, order: 1e9 + orphans.size, charts: [] };
      orphans.set(key, song);
    }
    song.charts.push(toChart(score.difficultyCode, score.level, score));
  }
  return [...songs, ...orphans.values()];
}
