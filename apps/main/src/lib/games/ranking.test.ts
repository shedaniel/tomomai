import { describe, expect, it } from "vitest";
import { RANKING_BUCKET_CODE } from "./codes";
import { getGame } from "./registry";
import { rankScores, rateScores, rateStoredRankings, selectRankings, sortByRating } from "./ranking";

const rated = (id: string, scoreValue: number, addedVersion: number, rating: number) => ({ id, scoreValue, addedVersion, rating });
const maimaiChart = (id: string, scoreValue: number, addedVersion = 14) =>
  ({ id, scoreValue, addedVersion, levelPrecise: 150, difficultyCode: 3, comboStatus: 0 });

describe("ranking selection", () => {
  it("uses each game's bucket sizes and new-chart rule without mutating inputs", () => {
    const scores = Array.from({ length: 80 }, (_, i) => rated(String(i), 1000000, i < 40 ? 14 : 13, i));
    const original = scores.map(score => ({ ...score }));
    const maimai = selectRankings(scores, 14, getGame("maimai").rating);
    expect([maimai.newScores.length, maimai.oldScores.length, maimai.newRemaining.length]).toEqual([15, 0, 65]);
    const chunithm = selectRankings(scores, 14, getGame("chunithm").rating);
    expect([chunithm.newScores.length, chunithm.oldScores.length]).toEqual([20, 30]);
    expect(scores).toEqual(original);
  });

  it("keeps maimai's precise rating and score ordering at the B15 cutoff", () => {
    const leaders = Array.from({ length: 14 }, (_, index) => maimaiChart(`leader-${index}`, 1005000));
    const { newScores, newRemaining } = rankScores("maimai", [...leaders, maimaiChart("lower", 995100), maimaiChart("higher", 995200)], 14);
    expect(newScores.at(-1)).toMatchObject({ id: "higher", rating: 314 });
    expect(newRemaining[0].id).toBe("lower");

    const tied = rankScores("maimai", [maimaiChart("capped-low", 1005000), maimaiChart("capped-high", 1006000)], 14);
    expect(tied.newScores.map(score => score.id)).toEqual(["capped-high", "capped-low"]);
  });

  it("orders by the precise rating before flooring it", () => {
    expect(sortByRating([rated("a", 1000000, 1, 300.2), rated("b", 1004000, 1, 300.9)]).map(score => [score.id, score.rating]))
      .toEqual([["b", 300], ["a", 300]]);
  });

  it("puts CiRCLE's previous-version charts in the maimai B15", () => {
    const { newScores, oldScores } = rankScores("maimai", [maimaiChart("current", 1000000, 12), maimaiChart("previous", 1000000, 11), maimaiChart("older", 1000000, 10)], 12);
    expect(newScores.map(score => score.id).sort()).toEqual(["current", "previous"]);
    expect(oldScores.map(score => score.id)).toEqual(["older"]);
  });
});

describe("chart rating", () => {
  it("keeps a rating computed before redaction and rates everything else", () => {
    const [kept, computed] = rateScores("maimai", [{ ...maimaiChart("kept", 0), chartRating: 316.168 }, maimaiChart("computed", 1005000)], 14);
    expect(kept.rating).toBe(316.168);
    expect(computed.rating).toBeCloseTo(337.68);
  });

  it("returns every rated score alongside the selection", () => {
    const { rated: all, newScores } = rankScores("chunithm", [maimaiChart("a", 1009000, 9), maimaiChart("b", 1000000, 9)], 9);
    expect(all.map(score => [score.id, score.rating])).toEqual([["a", 1715], ["b", 1600]]);
    expect(newScores.map(score => score.id)).toEqual(["a", "b"]);
  });

  it("rates stored rows by their persisted bucket and order", () => {
    const rows = [
      { ...maimaiChart("stored-new", 1000000, 1), bucket: RANKING_BUCKET_CODE.new },
      { ...maimaiChart("stored-old", 1005000, 14), bucket: RANKING_BUCKET_CODE.old },
    ];
    const { newScores, oldScores } = rateStoredRankings("maimai", rows, 14);
    expect(newScores.map(score => [score.id, score.rating])).toEqual([["stored-new", 324]]);
    expect(oldScores.map(score => [score.id, score.rating])).toEqual([["stored-old", 337]]);
  });
});
