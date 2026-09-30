import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { GameProvider } from "@/components/providers/game-provider";
import type { CanonicalGameId, Region } from "@/lib/games/ids";
import { loadMessages } from "@/i18n/messages";
import { SongDetailContent } from "./song-detail-content";
import type { ChartTypeKey, SongDetails } from "./types";
import { testGame } from "@/test/games";

const { userScores, scoreQueries } = vi.hoisted(() => ({
  userScores: { jp: { master: { scoreValue: 1_005_000, comboStatus: 4, syncStatus: 5, clearStatus: 0 } } },
  scoreQueries: [] as { enabled: boolean }[],
}));
vi.mock("@/lib/trpc-client", () => ({ trpc: {
  useUtils: () => ({ user: { getSongScores: { reset: () => {} } } }),
  user: {
    getSongDetails: { useQuery: () => ({ data: undefined, isLoading: false, error: null }) },
    getSongScores: { useQuery: (_input: unknown, options: { enabled: boolean }) => { scoreQueries.push(options); return { data: { viewerId: "viewer", userScores } }; } },
  },
} }));
vi.mock("@/lib/auth-client", () => ({ useSession: () => ({ data: { user: { id: "viewer" } } }) }));
vi.mock("@/i18n/navigation", () => ({ Link: ({ children }: { children: React.ReactNode }) => <span>{children}</span> }));
vi.mock("@/components/cover-image", () => ({ CoverImage: () => null }));

const chart = { difficulty: "master" as const, level: "14", levelPrecise: 147, addedVersion: 20, noteDesigner: null, tapCount: null, holdCount: null, slideCount: null, touchCount: null, breakCount: null };
const song: SongDetails = {
  parentIds: ["parent"], songName: "Song", artist: "Artist", cover: "", type: "dx", genre: "POPS", bpm: 150, addedVersion: 20,
  regions: [{ region: "jp", versions: [{ gameVersion: 20, charts: [chart] }] }],
};

async function render(game: CanonicalGameId, type: ChartTypeKey, regions: Region[] = ["jp"]) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={await loadMessages(game, "en")} timeZone="UTC">
      <GameProvider game={testGame(game, regions)}>
        <SongDetailContent songName="Song" slug="song" type={type} initialData={{ ...song, type }} />
      </GameProvider>
    </NextIntlClientProvider>,
  );
}

describe("song detail", () => {
  it("fills the availability chips and colours the maimai status badges", async () => {
    const html = await render("maimai", "dx");
    expect(html).toMatch(/<div class="[^"]*text-white bg-violet-500">MASTER 14\.7<\/div>/);
    expect(html).toMatch(/<span class="[^"]*bg-gradient-to-r[^"]*">AP\+<\/span>/);
    expect(html).toMatch(/<span class="[^"]*bg-gradient-to-r[^"]*">FDX\+<\/span>/);
  });

  it("names the chart in the summary once per game", async () => {
    expect(await render("maimai", "dx")).toContain("Song is a maimai でらっくす DX chart by Artist in the POPS genre");
    expect(await render("maimai", "std")).toContain("Song is a maimai でらっくす Standard chart by Artist");
    const chunithm = await render("chunithm", "standard");
    expect(chunithm).toContain("Song is a CHUNITHM chart by Artist in the POPS genre");
    expect(chunithm).not.toContain("CHUNITHM  chart");
  });

  it("asks for the viewer's scores only while the game offers player features", async () => {
    await render("chunithm", "standard");
    expect(scoreQueries.at(-1)?.enabled).toBe(true);
    await render("chunithm", "standard", []);
    expect(scoreQueries.at(-1)?.enabled).toBe(false);
  });
});
