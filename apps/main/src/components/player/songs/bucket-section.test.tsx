import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { GameProvider } from "@/components/providers/game-provider";
import { codeOf } from "@/lib/games/codes";
import { toFrontendGame } from "@/lib/games/frontend";
import { getGame } from "@/lib/games/registry";
import type { CanonicalGameId } from "@/lib/games/types";
import messages from "../../../../messages/en.json";
import { SongSection } from "./bucket-section";
import type { RatedScore } from "./types";

vi.mock("@/components/games/maimai/song-hover-card", () => ({ SongHoverCard: () => null }));
vi.mock("@/i18n/navigation", () => ({ Link: () => null }));

function score(game: CanonicalGameId, overrides: Partial<RatedScore>): RatedScore {
  return {
    songId: "chart", songName: "Song", artist: "Artist", cover: "", difficultyCode: codeOf(game, "difficulty", "master"), typeCode: 0,
    level: "14", levelPrecise: 140, genre: "", addedVersion: 1, scoreValue: 1_000_000, secondaryScore: null,
    comboStatus: 0, syncStatus: 0, clearStatus: 0, rating: 0, ...overrides,
  };
}

function renderCompact(game: CanonicalGameId, songs: RatedScore[]) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <GameProvider game={toFrontendGame(getGame(game), ["jp"])}>
        <SongSection title="Best" songs={songs} count={`${songs.length}`} ranked displayMode="compact" visibleCount={songs.length} onLoadMore={() => {}} />
      </GameProvider>
    </NextIntlClientProvider>,
  );
}

const headers = (html: string) => [...html.matchAll(/<div class="font-semibold text-muted-foreground[^"]*">([^<]+)<\/div>/g)].map(match => match[1]);

describe("compact song section", () => {
  it("keeps the maimai FC and FS columns, the rating sum and the master cell colours", () => {
    const html = renderCompact("maimai", [
      score("maimai", { songId: "a", rating: 300, comboStatus: codeOf("maimai", "comboStatus", "ap+") }),
      score("maimai", { songId: "b", rating: 301 }),
    ]);
    expect(headers(html)).toEqual(["Song", "Artist", "Level", "Achievement", "FC", "FS", "Rating"]);
    expect(html).toMatch(/<div class="[^"]*bg-purple-300[^"]*">14\.0<\/div>/);
    expect(html).toContain("Sum</span><span class=\"font-mono font-medium\">601</span>");
    expect(html).toContain("300.50");
  });

  it("shows CHUNITHM statuses in one column and its average rating without a sum", () => {
    const html = renderCompact("chunithm", [
      score("chunithm", { songId: "a", rating: 1615, comboStatus: codeOf("chunithm", "comboStatus", "aj"), clearStatus: codeOf("chunithm", "clearStatus", "hard") }),
      score("chunithm", { songId: "b", rating: 1605 }),
    ]);
    expect(headers(html)).toEqual(["Song", "Artist", "Level", "Score", "Status", "Rating"]);
    expect(html).toContain(">AJ HARD<");
    expect(html).not.toContain("Sum");
    expect(html).toContain("16.10");
  });
});
