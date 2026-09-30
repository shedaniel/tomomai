import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { GameProvider } from "@/components/providers/game-provider";
import type { CanonicalGameId } from "@/lib/games/ids";
import type { BrandSection } from "@/lib/games/types";
import { BrandLogo } from "./brand-logo";
import { testGame } from "@/test/games";

function render(game: CanonicalGameId, section: BrandSection) {
  return renderToStaticMarkup(
    <GameProvider game={testGame(game, ["intl"])}>
      <BrandLogo section={section} height={44} />
    </GameProvider>,
  );
}

it("draws the section's light and dark wordmarks", () => {
  const markup = render("maimai", "db");
  expect(markup).toContain("icon-db-small.webp");
  expect(markup).toContain("icon-db-small-dark.webp");
  expect(markup).not.toContain("icon-small.webp");
  expect(markup).toContain('alt="tomomai"');
});

it("sets the brand title as text for a game without artwork", () => {
  const markup = render("chunithm", "dashboard");
  expect(markup).toBe('<span class="text-2xl font-semibold">tomochu ともチュウ</span>');
});
