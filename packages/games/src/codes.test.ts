import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CODE_KINDS,
  GAME_CODES,
  RANKING_BUCKETS,
  RANKING_BUCKET_CODE,
  chartTypeToCode,
  codeOf,
  codeToChartType,
  codeToComboStatus,
  codeToDifficulty,
  codeToSyncStatus,
  codeToTitleType,
  comboStatusToCode,
  createCodec,
  difficultyToCode,
  keyOf,
  syncStatusToCode,
  titleTypeToCode,
  type CodedGame,
} from "./codes.ts";

const games = Object.keys(GAME_CODES) as CodedGame[];

describe("game codes", () => {
  for (const game of games) {
    it(`round-trips every ${game} key through its code`, () => {
      for (const kind of CODE_KINDS) {
        const keys: readonly string[] = GAME_CODES[game][kind];
        assert.equal(new Set(keys).size, keys.length);
        keys.forEach((key, code) => {
          assert.equal(codeOf(game, kind, key as never), code);
          assert.equal(keyOf(game, kind, code), key);
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

  it("returns undefined for unknown codes and throws for unknown keys", () => {
    for (const code of [-1, 1.5, 99, Number.NaN]) {
      assert.equal(keyOf("maimai", "difficulty", code), undefined);
    }
    assert.throws(() => codeOf("chunithm", "comboStatus", "ap" as never), { message: "Unknown chunithm combo status: ap" });
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

  it("builds a codec over any value list", () => {
    const codec = createCodec(["a", "b"], "test letter");
    assert.equal(codec.fromCode(1), "b");
    assert.equal(codec.toCode("a"), 0);
    assert.equal(codec.has(2), false);
    assert.throws(() => codec.fromCode(2), { message: "Unknown test letter code: 2" });
  });
});

describe("ranking buckets", () => {
  it("derives the key to code map from the bucket list", () => {
    assert.deepEqual(RANKING_BUCKET_CODE, { new: 1, old: 2 });
    assert.deepEqual(RANKING_BUCKETS.map(bucket => RANKING_BUCKET_CODE[bucket.key]), [1, 2]);
  });
});
