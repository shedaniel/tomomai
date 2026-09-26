export const MAIMAI_DIFFICULTIES = /** @type {const} */ (["basic", "advanced", "expert", "master", "remaster", "utage"]);
export const MAIMAI_CHART_TYPES = /** @type {const} */ (["std", "dx"]);
export const MAIMAI_COMBO_STATUSES = /** @type {const} */ (["none", "fc", "fc+", "ap", "ap+"]);
export const MAIMAI_SYNC_STATUSES = /** @type {const} */ (["none", "sync", "fs", "fs+", "fdx", "fdx+"]);
export const MAIMAI_TITLE_TYPES = /** @type {const} */ (["normal", "bronze", "silver", "gold", "rainbow"]);

/** @param {readonly string[]} values */
function codes(values) {
  return Object.fromEntries(values.map((value, index) => [index, value]));
}

export const RANKING_BUCKET_CODES = /** @type {const} */ ({ 1: "new", 2: "old" });
export const GAME_CODE_MAPS = {
  maimai: {
    chartType: { ...codes(MAIMAI_CHART_TYPES), 0: "standard" },
    difficulty: codes(MAIMAI_DIFFICULTIES),
    comboStatus: codes(MAIMAI_COMBO_STATUSES),
    syncStatus: codes(MAIMAI_SYNC_STATUSES),
    clearStatus: { 0: "none" },
    titleType: codes(MAIMAI_TITLE_TYPES),
    rankingBucket: RANKING_BUCKET_CODES,
  },
  chunithm: {
    chartType: { 0: "standard", 1: "worlds-end" },
    difficulty: { 0: "basic", 1: "advanced", 2: "expert", 3: "master", 4: "ultima", 5: "worlds-end" },
    comboStatus: { 0: "none", 1: "fc", 2: "aj", 3: "ajc" },
    syncStatus: { 0: "none", 1: "full-chain", 2: "full-chain-aj" },
    clearStatus: { 0: "none", 1: "clear", 2: "hard", 3: "brave", 4: "absolute", 5: "catastrophy" },
    titleType: { 0: "normal" },
    rankingBucket: RANKING_BUCKET_CODES,
  },
};

/**
 * @template {string} T
 * @param {readonly T[]} values
 * @param {number} code
 * @param {string} name
 * @returns {T}
 */
function valueFor(values, code, name) {
  const value = values[code];
  if (value === undefined) throw new Error(`Unknown maimai ${name} code: ${code}`);
  return value;
}

/** @param {number} code */
export function codeToDifficulty(code) {
  return valueFor(MAIMAI_DIFFICULTIES, code, "difficulty");
}

/** @param {number} code */
export function codeToChartType(code) {
  return valueFor(MAIMAI_CHART_TYPES, code, "chart type");
}
