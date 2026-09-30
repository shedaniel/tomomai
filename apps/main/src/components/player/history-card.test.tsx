import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { formatGameRating } from "@/lib/games/presentation";
import { RatingTooltipRow } from "./history-card";

describe("rating history tooltip", () => {
  it.each([
    { game: "maimai", rating: 15234, shown: "15,234" },
    { game: "chunithm", rating: 1723, shown: "17.23" },
  ] as const)("keeps the colour marker and label beside the $game rating", ({ game, rating, shown }) => {
    const markup = renderToStaticMarkup(
      <RatingTooltipRow color="var(--color-rating)" label="Rating" value={formatGameRating(game, rating, { grouped: true })} />,
    );
    expect(markup).toContain('style="background-color:var(--color-rating)"');
    expect(markup).toContain(">Rating</span>");
    expect(markup).toContain(`>${shown}</span>`);
  });
});
