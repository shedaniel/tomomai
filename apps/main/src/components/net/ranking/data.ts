import type { UniqueSong } from "@/components/db/songs/types";
import { codeOf, isCodeKey } from "@/lib/games/codes";
import type { GamePlayerScore } from "@/lib/games/player-view";
import { formatGameScore } from "@/lib/games/presentation";
import { netDifficulty, type NetDifficulty } from "../difficulty";

export const NET_RANKING_METRICS = ["level", "title", "nicknames"] as const;
export type NetRankingMetric = (typeof NET_RANKING_METRICS)[number];

export type NetRankingEntry = {
  name: string;
  cover: string;
  dx: boolean;
  value: number;
  /** The player's achievement on this chart, which makes them its world #1 by default. */
  mine: string | null;
};

export type NetRankingBoards = Record<NetRankingMetric, Partial<Record<NetDifficulty, NetRankingEntry[]>>>;

const BOARD_SIZE = 30;

function scoreKey(songName: string, typeCode: number, difficultyCode: number): string {
  return `${songName}\u0000${typeCode}\u0000${difficultyCode}`;
}

/** Real catalog data ranked by things no one asked to rank, one board per metric and difficulty. */
export function buildNetRankingBoards(catalog: readonly UniqueSong[], scores: readonly GamePlayerScore[], gameVersion: number): NetRankingBoards {
  const best = new Map<string, number>();
  for (const score of scores) {
    const key = scoreKey(score.songName, score.typeCode, score.difficultyCode);
    best.set(key, Math.max(best.get(key) ?? -Infinity, score.scoreValue));
  }

  const pools = Object.fromEntries(NET_RANKING_METRICS.map(metric => [metric, {}])) as Record<NetRankingMetric, Partial<Record<NetDifficulty, NetRankingEntry[]>>>;
  const add = (metric: NetRankingMetric, difficulty: NetDifficulty, entry: NetRankingEntry) => {
    (pools[metric][difficulty] ??= []).push(entry);
  };

  for (const song of catalog) {
    if (song.addedVersion > gameVersion || !isCodeKey("maimai", "chartType", song.type)) continue;
    const typeCode = codeOf("maimai", "chartType", song.type);
    const titleLength = [...song.songName].length;
    for (const chart of song.difficulties) {
      if (!isCodeKey("maimai", "difficulty", chart.difficulty)) continue;
      const difficultyCode = codeOf("maimai", "difficulty", chart.difficulty);
      const difficulty = netDifficulty(difficultyCode);
      const mine = best.get(scoreKey(song.songName, typeCode, difficultyCode));
      const base = { name: song.songName, cover: song.cover, dx: song.type === "dx", mine: mine == null ? null : formatGameScore("maimai", mine) };
      if (chart.levelPrecise > 0) add("level", difficulty, { ...base, value: chart.levelPrecise });
      add("title", difficulty, { ...base, value: titleLength });
      if (song.aliases.length > 0) add("nicknames", difficulty, { ...base, value: song.aliases.length });
    }
  }

  for (const metric of NET_RANKING_METRICS) {
    for (const [difficulty, entries] of Object.entries(pools[metric]) as [NetDifficulty, NetRankingEntry[]][]) {
      pools[metric][difficulty] = entries
        .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name))
        .slice(0, BOARD_SIZE);
    }
  }
  return pools;
}
