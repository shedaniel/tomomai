import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  GAME_CODES,
  RANKING_BUCKET_CODE,
  chartTypeToCode,
  codeOf,
  codeToChartType,
  codeToComboStatus,
  codeToDifficulty,
  codeToSyncStatus,
  codeToTitleType,
  comboStatusToCode,
  definedKeyOf,
  difficultyToCode,
  hasCode,
  isCodeKey,
  keyOf,
  syncStatusToCode,
  titleTypeToCode,
  type CodeKind,
  type CodedGame,
} from "./codes.ts";

const games = Object.keys(GAME_CODES) as CodedGame[];

describe("game codes", () => {
  for (const game of games) {
    it(`round-trips every ${game} key through its code`, () => {
      for (const kind of Object.keys(GAME_CODES[game]) as CodeKind[]) {
        const keys: readonly string[] = GAME_CODES[game][kind];
        assert.equal(new Set(keys).size, keys.length);
        keys.forEach((key, code) => {
          assert.equal(codeOf(game, kind, key), code);
          assert.equal(keyOf(game, kind, code), key);
          assert.equal(definedKeyOf(game, kind, code), key);
          assert.ok(hasCode(game, kind, code));
          assert.ok(isCodeKey(game, kind, key));
        });
      }
    });
  }

  it("names maimai chart type 0 std and gives CHUNITHM a single standard chart type", () => {
    assert.equal(keyOf("maimai", "chartType", 0), "std");
    assert.equal(codeOf("maimai", "chartType", "dx"), 1);
    assert.deepEqual(GAME_CODES.chunithm.chartType, ["standard"]);
    assert.equal(codeOf("chunithm", "difficulty", "worlds-end"), 5);
  });

  it("reads unknown codes as their number, or throws where the key must be defined, and throws for unknown keys", () => {
    for (const code of [-1, 1.5, 99, Number.NaN]) {
      assert.equal(hasCode("maimai", "difficulty", code), false);
      assert.equal(keyOf("maimai", "difficulty", code), String(code));
      assert.throws(() => definedKeyOf("maimai", "difficulty", code), { message: `Unknown maimai difficulty code: ${code}` });
    }
    assert.equal(isCodeKey("maimai", "chartType", "standard"), false);
    // @ts-expect-error A literal key the game does not define fails typecheck.
    assert.throws(() => codeOf("chunithm", "comboStatus", "ap"), { message: "Unknown chunithm combo status: ap" });
    const runtimeKey: string = "ap";
    assert.throws(() => codeOf("chunithm", "comboStatus", runtimeKey), { message: "Unknown chunithm combo status: ap" });
  });

  it("round-trips the typed maimai codecs", () => {
    const codecs = [
      [codeToDifficulty, difficultyToCode, GAME_CODES.maimai.difficulty],
      [codeToChartType, chartTypeToCode, GAME_CODES.maimai.chartType],
      [codeToComboStatus, comboStatusToCode, GAME_CODES.maimai.comboStatus],
      [codeToSyncStatus, syncStatusToCode, GAME_CODES.maimai.syncStatus],
      [codeToTitleType, titleTypeToCode, GAME_CODES.maimai.titleType],
    ] as const;
    for (const [decode, encode, keys] of codecs) {
      keys.forEach((key, code) => {
        assert.equal(decode(code), key);
        assert.equal((encode as (value: string) => number)(key), code);
      });
    }
    assert.throws(() => codeToChartType(2), { message: "Unknown maimai chart type code: 2" });
    assert.throws(() => difficultyToCode("ultima" as never), { message: "Unknown maimai difficulty: ultima" });
  });
});

describe("ranking buckets", () => {
  it("keeps the persisted bucket codes", () => {
    assert.deepEqual(RANKING_BUCKET_CODE, { new: 1, old: 2 });
  });
});
