import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { GameProvider } from "@/components/providers/game-provider";
import { codeOf } from "@/lib/games/codes";
import { toFrontendGame } from "@/lib/games/frontend";
import { getGame } from "@/lib/games/registry";
import type { CanonicalGameId } from "@/lib/games/types";
import { ChartTypeBadge } from "./chart-type-badge";

function render(game: CanonicalGameId, badge: React.ReactElement) {
  return renderToStaticMarkup(<GameProvider game={toFrontendGame(getGame(game), ["jp"])}>{badge}</GameProvider>);
}

describe("ChartTypeBadge", () => {
  it("shows the maimai badge image, or its label chip in catalog rows", () => {
    const dx = codeOf("maimai", "chartType", "dx");
    const image = render("maimai", <ChartTypeBadge typeCode={dx} />);
    expect(image).toMatch(/<img[^>]*alt="DX"/);
    expect(image).toContain("/covers/music_dx.webp");

    const label = render("maimai", <ChartTypeBadge typeCode={dx} variant="label" />);
    expect(label).not.toContain("<img");
    expect(label).toMatch(/<span class="[^"]*bg-amber-100[^"]*">DX<\/span>/);
  });

  it("renders nothing for the CHUNITHM standard type every chart has", () => {
    const standard = codeOf("chunithm", "chartType", "standard");
    expect(render("chunithm", <ChartTypeBadge typeCode={standard} />)).toBe("");
    expect(render("chunithm", <ChartTypeBadge typeCode={standard} variant="label" />)).toBe("");
  });
});
