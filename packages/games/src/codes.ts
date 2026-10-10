// A code is its key's index. Codes are persisted and published, so only ever append keys.

export type CodeKind = "difficulty" | "chartType" | "comboStatus" | "syncStatus" | "clearStatus" | "titleType";

type CodeTable = { readonly [K in CodeKind]: readonly string[] };

const MAIMAI_CODES = {
  difficulty: ["basic", "advanced", "expert", "master", "remaster", "utage"],
  chartType: ["std", "dx"],
  comboStatus: ["none", "fc", "fc+", "ap", "ap+"],
  syncStatus: ["none", "sync", "fs", "fs+", "fdx", "fdx+"],
  clearStatus: ["none"],
  titleType: ["normal", "bronze", "silver", "gold", "rainbow"],
} as const satisfies CodeTable;

// WORLD'S END is a difficulty, so CHUNITHM charts have a single chart type.
const CHUNITHM_CODES = {
  difficulty: ["basic", "advanced", "expert", "master", "ultima", "worlds-end"],
  chartType: ["standard"],
  comboStatus: ["none", "fc", "aj", "ajc"],
  syncStatus: ["none", "full-chain", "full-chain-aj"],
  clearStatus: ["none", "clear", "hard", "brave", "absolute", "catastrophy"],
  titleType: ["normal"],
} as const satisfies CodeTable;

export const GAME_CODES = {
  maimai: MAIMAI_CODES,
  chunithm: CHUNITHM_CODES,
} as const;

export type CodedGame = keyof typeof GAME_CODES;
export type CodeKey<G extends CodedGame, K extends CodeKind> = (typeof GAME_CODES)[G][K][number];

const KIND_LABELS: { readonly [K in CodeKind]: string } = {
  difficulty: "difficulty",
  chartType: "chart type",
  comboStatus: "combo status",
  syncStatus: "sync status",
  clearStatus: "clear status",
  titleType: "title type",
};

function keysOf(game: CodedGame, kind: CodeKind): readonly string[] {
  return GAME_CODES[game][kind];
}

/** A literal key must be one the game defines, so a typo fails typecheck. A runtime string is checked by the call. */
type KeyArgument<G extends CodedGame, K extends CodeKind, S extends string> = string extends S ? string : CodeKey<G, K>;

/** The stored code of a key. Throws for a key the game does not define. */
export function codeOf<G extends CodedGame, K extends CodeKind, S extends string>(game: G, kind: K, key: S & KeyArgument<G, K, S>): number {
  const code = keysOf(game, kind).indexOf(key);
  if (code < 0) throw new Error(`Unknown ${game} ${KIND_LABELS[kind]}: ${key}`);
  return code;
}

/** The key of a stored code. A code this build does not define reads as its number. */
export function keyOf(game: CodedGame, kind: CodeKind, code: number): string {
  return hasCode(game, kind, code) ? keysOf(game, kind)[code] : String(code);
}

/** The key of a stored code the game defines. Throws for any other code, as codeOf does for keys. */
export function definedKeyOf<G extends CodedGame, K extends CodeKind>(game: G, kind: K, code: number): CodeKey<G, K> {
  if (!hasCode(game, kind, code)) throw new Error(`Unknown ${game} ${KIND_LABELS[kind]} code: ${code}`);
  const keys: readonly CodeKey<G, K>[] = GAME_CODES[game][kind];
  return keys[code];
}

export function hasCode(game: CodedGame, kind: CodeKind, code: number): boolean {
  return Number.isInteger(code) && code >= 0 && code < keysOf(game, kind).length;
}

export function isCodeKey<G extends CodedGame, K extends CodeKind>(game: G, kind: K, key: string): key is CodeKey<G, K> {
  return keysOf(game, kind).includes(key);
}

export const RANKING_BUCKETS = [
  { key: "new", code: 1 },
  { key: "old", code: 2 },
] as const;

type RankingBucket = (typeof RANKING_BUCKETS)[number];

export const RANKING_BUCKET_CODE = Object.fromEntries(RANKING_BUCKETS.map(({ key, code }) => [key, code])) as {
  readonly [B in RankingBucket as B["key"]]: B["code"];
};
