import { GAME_CODES, codeOf, definedKeyOf, type CodeKey, type CodeKind } from "../codes";

export const MAIMAI_CODES = GAME_CODES.maimai;

type Codec<K extends CodeKind> = {
  readonly fromCode: (code: number) => CodeKey<"maimai", K>;
  readonly toCode: (key: CodeKey<"maimai", K>) => number;
};

// Named shorthands for codeOf and definedKeyOf on maimai's codes.
function codec<K extends CodeKind>(kind: K): Codec<K> {
  return {
    fromCode: code => definedKeyOf("maimai", kind, code),
    toCode: key => codeOf("maimai", kind, key),
  };
}

const difficulty = codec("difficulty");
const chartType = codec("chartType");
const comboStatus = codec("comboStatus");
const syncStatus = codec("syncStatus");
const titleType = codec("titleType");

export const codeToDifficulty = difficulty.fromCode;
export const difficultyToCode = difficulty.toCode;
export const codeToChartType = chartType.fromCode;
export const chartTypeToCode = chartType.toCode;
export const codeToComboStatus = comboStatus.fromCode;
export const comboStatusToCode = comboStatus.toCode;
export const codeToSyncStatus = syncStatus.fromCode;
export const syncStatusToCode = syncStatus.toCode;
export const codeToTitleType = titleType.fromCode;
export const titleTypeToCode = titleType.toCode;
