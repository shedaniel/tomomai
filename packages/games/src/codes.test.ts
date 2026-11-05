import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  GAME_CODES,
  RANKING_BUCKET_CODE,
  codeOf,
  definedKeyOf,
  hasCode,
  isCodeKey,
  keyOf,
} from "./codes.ts";

describe("game codes", () => {
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
});

describe("ranking buckets", () => {
  it("keeps the persisted bucket codes", () => {
    assert.deepEqual(RANKING_BUCKET_CODE, { new: 1, old: 2 });
  });
});
