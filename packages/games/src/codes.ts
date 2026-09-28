// A code is its key's index. Codes are persisted and published, so only ever append keys.

const CODE_KINDS = ["difficulty", "chartType", "comboStatus", "syncStatus", "clearStatus", "titleType"] as const;
export type CodeKind = (typeof CODE_KINDS)[number];

type CodeTable = { readonly [K in CodeKind]: readonly string[] };

export const MAIMAI_CODES = {
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

type Codec<T extends string> = {
  readonly values: readonly T[];
  readonly fromCode: (code: number) => T;
  readonly toCode: (key: T) => number;
  readonly has: (code: number) => boolean;
};

function createCodec<const T extends string>(values: readonly T[], label: string): Codec<T> {
  const has = (code: number) => Number.isInteger(code) && code >= 0 && code < values.length;
  return {
    values,
    has,
    fromCode: code => {
      if (!has(code)) throw new Error(`Unknown ${label} code: ${code}`);
      return values[code];
    },
    toCode: key => {
      const code = values.indexOf(key);
      if (code < 0) throw new Error(`Unknown ${label}: ${key}`);
      return code;
    },
  };
}

type GameCodecs<G extends CodedGame> = { readonly [K in CodeKind]: Codec<CodeKey<G, K>> };

function createGameCodecs<G extends CodedGame>(game: G): GameCodecs<G> {
  const codecs = CODE_KINDS.map(kind => [kind, createCodec(GAME_CODES[game][kind], `${game} ${KIND_LABELS[kind]}`)]);
  return Object.fromEntries(codecs) as GameCodecs<G>;
}

const GAME_CODECS: { readonly [G in CodedGame]: GameCodecs<G> } = {
  maimai: createGameCodecs("maimai"),
  chunithm: createGameCodecs("chunithm"),
};

function codecOf<G extends CodedGame, K extends CodeKind>(game: G, kind: K): Codec<CodeKey<G, K>> {
  return GAME_CODECS[game][kind] as Codec<CodeKey<G, K>>;
}

export function codeOf<G extends CodedGame, K extends CodeKind>(game: G, kind: K, key: CodeKey<G, K>): number {
  return codecOf(game, kind).toCode(key);
}

export function keyOf<G extends CodedGame, K extends CodeKind>(game: G, kind: K, code: number): CodeKey<G, K> | undefined {
  const codec = codecOf(game, kind);
  return codec.has(code) ? codec.fromCode(code) : undefined;
}

const maimai = GAME_CODECS.maimai;
export const codeToDifficulty = maimai.difficulty.fromCode;
export const difficultyToCode = maimai.difficulty.toCode;
export const codeToChartType = maimai.chartType.fromCode;
export const chartTypeToCode = maimai.chartType.toCode;
export const codeToComboStatus = maimai.comboStatus.fromCode;
export const comboStatusToCode = maimai.comboStatus.toCode;
export const codeToSyncStatus = maimai.syncStatus.fromCode;
export const syncStatusToCode = maimai.syncStatus.toCode;
export const codeToTitleType = maimai.titleType.fromCode;
export const titleTypeToCode = maimai.titleType.toCode;

export const RANKING_BUCKETS = [
  { key: "new", code: 1 },
  { key: "old", code: 2 },
] as const;

type RankingBucket = (typeof RANKING_BUCKETS)[number];

export const RANKING_BUCKET_CODE = Object.fromEntries(RANKING_BUCKETS.map(({ key, code }) => [key, code])) as {
  readonly [B in RankingBucket as B["key"]]: B["code"];
};
