import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

const catalog = vi.hoisted(() => ({ details: vi.fn() }));
vi.mock("@/lib/games/current", async () => {
  const { testGame } = await import("@/test/games");
  return { getCurrentGame: () => testGame("chunithm", []) };
});
vi.mock("@/server/queries/songs-cache", () => ({
  getAllUniqueSongsCached: async () => [{ slug: "song-standard", songName: "Song", artist: "Artist", type: "standard", parentIds: ["abcdefgh"] }],
}));
vi.mock("@/server/queries/songs", () => ({ querySongDetails: catalog.details }));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string, values: { songName: string }) => `${key} ${values.songName}` }));
vi.mock("@/components/db/songs/song-detail-content", () => ({
  SongDetailContent: ({ initialData }: { initialData: { songName: string } }) => <p>{initialData.songName}</p>,
}));

import DetailSlotPage from "./page";

it("renders the catalog details of the slug's song while the game has no player region", async () => {
  catalog.details.mockResolvedValue({ songName: "Song details" });
  const html = renderToStaticMarkup(await DetailSlotPage({ params: Promise.resolve({ type: "songs", slug: "song-standard" }) }));
  expect(html).toContain("Song details");
  expect(html).toContain('data-song-slug="song-standard"');
  expect(catalog.details).toHaveBeenCalledWith(expect.objectContaining({ game: "chunithm", songName: "Song", type: "standard", parentIds: ["abcdefgh"] }));
});
