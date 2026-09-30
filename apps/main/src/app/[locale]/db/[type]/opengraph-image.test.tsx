import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CanonicalGameId } from "@/lib/games/ids";

const current = vi.hoisted(() => ({ game: "maimai" as CanonicalGameId, taglines: [] as string[] }));

vi.mock("next-intl/server", async () => {
  const { createTranslator } = await import("next-intl");
  const { loadMessages } = await import("@/i18n/messages");
  return {
    getTranslations: async ({ namespace }: { namespace: string }) => createTranslator({
      locale: "en",
      messages: await loadMessages(current.game, "en"),
      namespace,
      onError(error) { throw error; },
    }),
  };
});
vi.mock("@/lib/games/current", async () => {
  const { testGame } = await import("@/test/games");
  return { getCurrentGame: () => testGame(current.game, ["intl", "jp"]) };
});
vi.mock("@/i18n/og-locale", () => ({ getOGImageLocales: async () => ["en"] }));
vi.mock("@/lib/og", () => ({
  OG_SIZE: {},
  createDbOGImage: ({ tagline }: { tagline: string }) => {
    current.taglines.push(tagline);
    return new Response("image");
  },
}));

import SectionImage from "./opengraph-image";

const draw = (type: string) => SectionImage({ params: Promise.resolve({ type }), id: Promise.resolve("en") });

beforeEach(() => { Object.assign(current, { game: "maimai", taglines: [] }); });

describe("catalog section image", () => {
  it("draws every section the maimai site offers, the hidden arcade map included", async () => {
    for (const type of ["songs", "stats", "events", "arcades"]) expect((await draw(type)).status).toBe(200);
    expect(current.taglines[1]).toMatch(/^Explore aggregate maimai DX statistics/);
    expect(current.taglines[3]).toBe(current.taglines[0]);
  });

  it("draws the CHUNITHM songs section with its own copy", async () => {
    current.game = "chunithm";
    expect((await draw("songs")).status).toBe(200);
    expect(current.taglines).toEqual([expect.stringMatching(/^Browse and search all CHUNITHM songs/)]);
  });

  it("answers 404 for a section the served game does not offer", async () => {
    expect((await draw("coming-soon")).status).toBe(404);
    current.game = "chunithm";
    expect((await draw("stats")).status).toBe(404);
    expect(current.taglines).toEqual([]);
  });
});
