import { GAME_CODES, codeOf, isCodeKey, type CodeKey } from "./games/codes";
import { getGame } from "./games/registry";
import { CANONICAL_GAME_IDS, type CanonicalGameId } from "./games/ids";

/** Stage names shared across games, of which a game runs the ones its `fetchStages` list. Each game's score lists add a `song_data:<difficulty>` stage per difficulty. */
export const FETCH_STATES = {
  LOGIN: "login",
  PLAYER_DATA: "player_data",
  RECENT_SONGS: "recent_songs",
  HIDDEN_SONGS: "hidden_songs",
  ALBUM_DATA: "album_data",
} as const;

type DifficultyKey = { [G in CanonicalGameId]: CodeKey<G, "difficulty"> }[CanonicalGameId];

export type SongDataState = `song_data:${DifficultyKey}`;
export type BaseFetchState = (typeof FETCH_STATES)[keyof typeof FETCH_STATES];
export type FetchState = BaseFetchState | SongDataState;

const SONG_DATA_PREFIX = "song_data:";

// maimai sessions stored before its BASIC stage took the difficulty's key.
const LEGACY_STATES: Readonly<Partial<Record<string, FetchState>>> = { "song_data:easy": "song_data:basic" };

/** The stage that completes when a difficulty's score list has been read. */
export function songDataState(game: CanonicalGameId, difficultyCode: number): SongDataState {
  const keys: readonly DifficultyKey[] = GAME_CODES[game].difficulty;
  const key = keys[difficultyCode];
  if (key === undefined) throw new Error(`Unknown ${game} difficulty code: ${difficultyCode}`);
  return `${SONG_DATA_PREFIX}${key}`;
}

export function isSongDataState(state: FetchState): state is SongDataState {
  return state.startsWith(SONG_DATA_PREFIX);
}

/** The difficulty code of a song data stage in the game, or null when the game has no such difficulty. */
export function songDataDifficulty(game: CanonicalGameId, state: SongDataState): number | null {
  const key = state.slice(SONG_DATA_PREFIX.length);
  return isCodeKey(game, "difficulty", key) ? codeOf(game, "difficulty", key) : null;
}

export function parseStatusStates(statusStates: string | null): FetchState[] {
  if (!statusStates?.trim()) return [];
  const known = CANONICAL_GAME_IDS.flatMap(game => getGame(game).fetchStages);
  const states = new Set<FetchState>();
  for (const stored of statusStates.split(",")) {
    const name = LEGACY_STATES[stored.trim()] ?? stored.trim();
    const state = known.find(candidate => candidate === name);
    if (state) states.add(state);
  }
  return [...states];
}

export function serializeStatusStates(states: FetchState[]): string {
  return states.join(",");
}

/** The share of the game's stages that have completed, as a whole percentage. */
export function calculateProgress(completedStates: readonly FetchState[], game: CanonicalGameId): number {
  const allStates = getGame(game).fetchStages;
  const completedCount = allStates.filter(state => completedStates.includes(state)).length;
  return Math.round((completedCount / allStates.length) * 100);
}
