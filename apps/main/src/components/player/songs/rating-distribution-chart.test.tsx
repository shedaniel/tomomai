import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { GameProvider } from "@/components/providers/game-provider";
import { codeOf } from "@/lib/games/codes";
import type { CanonicalGameId } from "@/lib/games/ids";
import { RatingDistributionChart } from "./rating-distribution-chart";
import { testGame } from "@/test/games";

// Server rendering has no layout to measure, so the chart gets a fixed size.
vi.mock("recharts", async importOriginal => {
  const recharts = await importOriginal<typeof import("recharts")>();
  const { cloneElement } = await import("react");
  return {
    ...recharts,
    ResponsiveContainer: ({ children }: { children: React.ReactElement<{ width?: number; height?: number }> }) => cloneElement(children, { width: 800, height: 200 }),
  };
});

function render(game: CanonicalGameId, scores: { difficulty: string; rating: number }[]) {
  const html = renderToStaticMarkup(
    <GameProvider game={testGame(game, ["jp"])}>
      <RatingDistributionChart title="Best" scores={scores.map(({ difficulty, rating }) => ({ difficultyCode: codeOf(game, "difficulty", difficulty), rating }))} />
    </GameProvider>,
  );
  const xAxis = html.slice(html.indexOf("recharts-xAxis"), html.indexOf("recharts-yAxis"));
  return { html, ranges: [...xAxis.matchAll(/<tspan[^>]*>([^<]+)<\/tspan>/g)].map(match => match[1]) };
}

describe("RatingDistributionChart", () => {
  it("groups CHUNITHM ratings into tenths and keeps empty ranges", () => {
    const { html, ranges } = render("chunithm", [
      { difficulty: "master", rating: 1612 },
      { difficulty: "master", rating: 1618 },
      { difficulty: "ultima", rating: 1647 },
    ]);
    expect(ranges).toEqual(["16.10", "16.20", "16.30", "16.40"]);
    expect(html).toContain("--color-ultima: var(--color-red-700);");
    expect(html).toContain('fill="var(--color-ultima)"');
  });

  it("gives each whole maimai rating its own bar in the difficulty colours", () => {
    const { html, ranges } = render("maimai", [
      { difficulty: "master", rating: 300 },
      { difficulty: "remaster", rating: 302 },
    ]);
    expect(ranges).toEqual(["300", "301", "302"]);
    expect(html).toContain("--color-remaster: var(--color-purple-200);");
    expect(html).toContain('fill="var(--color-remaster)"');
  });
});
