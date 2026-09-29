import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { GameProvider } from "@/components/providers/game-provider";
import { toFrontendGame } from "@/lib/games/frontend";
import { getGame } from "@/lib/games/registry";
import messages from "../../../../messages/en.json";
import { SongDetailContent } from "./song-detail-content";
import type { SongDetails } from "./types";

const userScores = vi.hoisted(() => ({ jp: { master: { scoreValue: 1_005_000, comboStatus: 4, syncStatus: 5, clearStatus: 0 } } }));
vi.mock("@/lib/trpc-client", () => ({ trpc: {
  useUtils: () => ({ user: { getSongScores: { reset: () => {} } } }),
  user: {
    getSongDetails: { useQuery: () => ({ data: undefined, isLoading: false, error: null }) },
    getSongScores: { useQuery: () => ({ data: { viewerId: "viewer", userScores } }) },
  },
} }));
vi.mock("@/lib/auth-client", () => ({ useSession: () => ({ data: { user: { id: "viewer" } } }) }));
vi.mock("@/i18n/navigation", () => ({ Link: ({ children }: { children: React.ReactNode }) => <span>{children}</span> }));
vi.mock("@/components/cover-image", () => ({ CoverImage: () => null }));

const chart = { difficulty: "master", level: "14", levelPrecise: 147, addedVersion: 20, noteDesigner: null, tapCount: null, holdCount: null, slideCount: null, touchCount: null, breakCount: null };
const song: SongDetails = {
  parentIds: ["parent"], songName: "Song", artist: "Artist", cover: "", type: "dx", genre: "POPS", bpm: 150, addedVersion: 20,
  regions: [{ region: "jp", versions: [{ gameVersion: 20, charts: [chart] }] }],
};

describe("song detail", () => {
  it("fills the availability chips and colours the maimai status badges", () => {
    const html = renderToStaticMarkup(
      <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
        <GameProvider game={toFrontendGame(getGame("maimai"), ["jp"])}>
          <SongDetailContent songName="Song" slug="song" type="dx" initialData={song} />
        </GameProvider>
      </NextIntlClientProvider>,
    );
    expect(html).toMatch(/<div class="[^"]*text-white bg-violet-500">MASTER 14\.7<\/div>/);
    expect(html).toMatch(/<span class="[^"]*bg-gradient-to-r[^"]*">AP\+<\/span>/);
    expect(html).toMatch(/<span class="[^"]*bg-gradient-to-r[^"]*">FDX\+<\/span>/);
  });
});
