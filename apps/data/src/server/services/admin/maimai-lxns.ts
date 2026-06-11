import { Difficulty, Level, NoteCounts, SongType } from "@tomomai/catalog/types";
import { normalizeGenre, normalizeName } from "@tomomai/catalog/name-utils";
import { getVersionByShortCode } from "@tomomai/catalog/metadata";
import { important, PendingSong } from "@/server/utils/admin/type";
import { levelToPrecise } from "@/server/utils/level";
import { asFetcher } from "./fetcher-utils";

const LXNS_SONG_LIST_URL = "https://maimai.lxns.net/api/v0/maimai/song/list?notes=true";

interface LxnsNotesSingle {
  total: number;
  tap: number;
  hold: number;
  slide: number;
  touch: number;
  break: number;
}

interface LxnsNotesBuddy {
  left: LxnsNotesSingle;
  right: LxnsNotesSingle;
}

type LxnsNotes = LxnsNotesSingle | LxnsNotesBuddy;

interface LxnsChart {
  type: "standard" | "dx" | "utage";
  difficulty: number;
  level: string;
  level_value: number;
  note_designer: string;
  version: number;
  notes?: LxnsNotes;
  kanji?: string;
  description?: string;
  is_buddy?: boolean;
}

interface LxnsSong {
  id: number;
  title: string;
  artist: string;
  genre: string;
  bpm: number;
  version: number;
  difficulties: {
    standard: LxnsChart[];
    dx: LxnsChart[];
    utage?: LxnsChart[];
  };
}

interface LxnsResponse {
  songs: LxnsSong[];
}

const DIFFICULTY_BY_INDEX: Difficulty[] = ["basic", "advanced", "expert", "master", "remaster"];

export const LxnsFetcher = asFetcher(async ({ notice }) => {
  const response = await fetch(LXNS_SONG_LIST_URL, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    },
  });
  if (response.status !== 200) {
    throw new Error(`Failed to fetch Lxns song list: HTTP ${response.status}`);
  }
  const data = (await response.json()) as LxnsResponse;
  notice.addDetail(`Fetched ${data.songs.length} songs from Lxns`);

  return data.songs.flatMap((song) => {
    const baseId = song.id % 10000;
    const cover = `https://assets2.lxns.net/maimai/jacket/${baseId}.png`;
    const genre = normalizeGenre(song.genre);

    const charts: PendingSong[] = [];

    const pushChart = (chart: LxnsChart, type: SongType, difficulty: Difficulty) => {
      const level = chart.level.replace("?", "") as Level;
      const addedVersion = getVersionByShortCode(String(chart.version))?.id;
      let noteCounts: NoteCounts | undefined = undefined;
      if (chart.notes) {
        const notes = chart.notes;
        if ("tap" in notes) {
          noteCounts = {
            tap: notes.tap,
            hold: notes.hold,
            slide: notes.slide,
            touch: notes.touch,
            break: notes.break,
          };
        } else {
          // Buddy chart: use left side
          noteCounts = {
            tap: notes.left.tap,
            hold: notes.left.hold,
            slide: notes.left.slide,
            touch: notes.left.touch,
            break: notes.left.break,
          };
        }
      }
      const levelPrecise =
        difficulty === "utage" || chart.level_value === 0
          ? levelToPrecise(level, addedVersion ?? 0)
          : Math.round(chart.level_value * 10);
      const noteDesigner =
        chart.note_designer && chart.note_designer !== "-" ? chart.note_designer : undefined;

      charts.push({
        songName: normalizeName(song.title),
        type,
        difficulty,
        level: important(level),
        levelPrecise: important(levelPrecise),
        cover: important(cover),
        genre: important(genre),
        artist: important(song.artist),
        addedVersion,
        bpm: song.bpm || undefined,
        noteDesigner,
        noteCounts,
      } satisfies PendingSong);
    };

    for (const chart of song.difficulties.standard ?? []) {
      const difficulty = DIFFICULTY_BY_INDEX[chart.difficulty];
      if (!difficulty) continue;
      pushChart(chart, "std", difficulty);
    }
    for (const chart of song.difficulties.dx ?? []) {
      const difficulty = DIFFICULTY_BY_INDEX[chart.difficulty];
      if (!difficulty) continue;
      pushChart(chart, "dx", difficulty);
    }
    for (const chart of song.difficulties.utage ?? []) {
      pushChart(chart, "dx", "utage");
    }

    return charts;
  });
});
