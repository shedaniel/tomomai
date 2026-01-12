// Define all possible fetch states
export const FETCH_STATES = {
  LOGIN: "login",
  PLAYER_DATA: "player_data",
  SONG_DATA_EASY: "song_data:easy",
  SONG_DATA_ADVANCED: "song_data:advanced",
  SONG_DATA_EXPERT: "song_data:expert",
  SONG_DATA_MASTER: "song_data:master",
  SONG_DATA_REMASTER: "song_data:remaster",
  RECENT_SONGS: "recent_songs",
  HIDDEN_SONGS: "hidden_songs",
  ALBUM_DATA: "album_data",
} as const;

export type FetchState = typeof FETCH_STATES[keyof typeof FETCH_STATES];

// Map difficulty numbers to state names
export const DIFFICULTY_STATE_MAP: Record<number, FetchState> = {
  0: FETCH_STATES.SONG_DATA_EASY,
  1: FETCH_STATES.SONG_DATA_ADVANCED,
  2: FETCH_STATES.SONG_DATA_EXPERT,
  3: FETCH_STATES.SONG_DATA_MASTER,
  4: FETCH_STATES.SONG_DATA_REMASTER,
};

// Helper function to parse statusStates string into array
export function parseStatusStates(statusStates: string | null): FetchState[] {
  if (!statusStates || statusStates.trim() === "") {
    return [];
  }
  return statusStates.split(",").map(state => state.trim() as FetchState);
}

// Helper function to serialize statusStates array into string
export function serializeStatusStates(states: FetchState[]): string {
  return states.join(",");
}

// Get all possible states in order
export function getAllStates(): FetchState[] {
  return [
    FETCH_STATES.LOGIN,
    FETCH_STATES.PLAYER_DATA,
    FETCH_STATES.SONG_DATA_EASY,
    FETCH_STATES.SONG_DATA_ADVANCED,
    FETCH_STATES.SONG_DATA_EXPERT,
    FETCH_STATES.SONG_DATA_MASTER,
    FETCH_STATES.SONG_DATA_REMASTER,
    FETCH_STATES.RECENT_SONGS,
    FETCH_STATES.HIDDEN_SONGS,
    FETCH_STATES.ALBUM_DATA,
  ];
}

// Calculate progress percentage based on completed states
export function calculateProgress(completedStates: FetchState[]): number {
  const allStates = getAllStates();
  const completedCount = completedStates.length;
  const totalCount = allStates.length;
  return Math.round((completedCount / totalCount) * 100);
}

// Helper function to get state for difficulty number
export function getStateForDifficulty(difficulty: number): FetchState | null {
  return DIFFICULTY_STATE_MAP[difficulty] || null;
}

// Check if all states are completed
export function isAllStatesCompleted(completedStates: FetchState[]): boolean {
  const allStates = getAllStates();
  return allStates.every(state => completedStates.includes(state));
}
