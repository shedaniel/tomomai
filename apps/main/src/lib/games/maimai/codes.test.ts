import { describe, expect, it } from "vitest";
import {
  MAIMAI_CODES,
  chartTypeToCode,
  codeToChartType,
  codeToComboStatus,
  codeToDifficulty,
  codeToSyncStatus,
  codeToTitleType,
  comboStatusToCode,
  difficultyToCode,
  syncStatusToCode,
  titleTypeToCode,
} from "./codes";

describe("maimai codecs", () => {
  it.each([
    ["difficulty", codeToDifficulty, difficultyToCode, MAIMAI_CODES.difficulty],
    ["chart type", codeToChartType, chartTypeToCode, MAIMAI_CODES.chartType],
    ["combo status", codeToComboStatus, comboStatusToCode, MAIMAI_CODES.comboStatus],
    ["sync status", codeToSyncStatus, syncStatusToCode, MAIMAI_CODES.syncStatus],
    ["title type", codeToTitleType, titleTypeToCode, MAIMAI_CODES.titleType],
  ] as const)("round-trips every %s", (_kind, decode, encode, keys) => {
    keys.forEach((key, code) => {
      expect(decode(code)).toBe(key);
      expect((encode as (value: string) => number)(key)).toBe(code);
    });
  });

  it("throws for a code or key maimai does not define", () => {
    expect(() => codeToChartType(2)).toThrow("Unknown maimai chart type code: 2");
    expect(() => difficultyToCode("ultima" as never)).toThrow("Unknown maimai difficulty: ultima");
  });
});
