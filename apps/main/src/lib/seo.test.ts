import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/base-url", () => ({ resolveBaseUrl: () => "https://site.test" }));
vi.mock("@/i18n/locale-server", () => ({ getLocale: async () => "en" }));

import { getGame } from "@/lib/games/registry";
import { buildPageMetadata } from "./seo";

const page = {
  brand: getGame("chunithm").brand,
  locale: "ja" as const,
  path: "/db/songs",
  title: "Songs | CHUNITHM",
  description: "Browse songs",
};

describe("page metadata", () => {
  it("links the page's own image in the current locale, or states that it has none", async () => {
    const withImage = await buildPageMetadata({ ...page, ogType: "website", image: "route" });
    expect(withImage.openGraph?.images).toEqual([
      { url: "https://site.test/ja/db/songs/opengraph-image/ja", alt: "Songs | CHUNITHM", width: 1200, height: 630, type: "image/png" },
    ]);
    const withoutImage = await buildPageMetadata({ ...page, ogType: "website", image: "none" });
    expect(withoutImage.openGraph?.images).toEqual([]);
  });

  it("names the brand's site and keeps the preview title out of the page title", async () => {
    const metadata = await buildPageMetadata({ ...page, ogTitle: "Songs", ogDescription: "Every song", ogType: "website", image: "route" });
    expect(metadata).toMatchObject({
      title: "Songs | CHUNITHM",
      description: "Browse songs",
      openGraph: { title: "Songs", description: "Every song", siteName: "tomochu ともチュウ", url: "/ja/db/songs", type: "website", locale: "ja_JP" },
      twitter: { card: "summary_large_image", title: "Songs | CHUNITHM", description: "Every song" },
    });
  });

  it("links only the languages the page exists in", async () => {
    const metadata = await buildPageMetadata({ ...page, locales: ["en", "ja"], ogType: "article", publishedTime: "2026-09-01", image: "route" });
    expect(metadata.alternates).toEqual({
      canonical: "/ja/db/songs",
      languages: { en: "/en/db/songs", ja: "/ja/db/songs", "x-default": "/en/db/songs" },
    });
    expect(metadata.openGraph).toMatchObject({ type: "article", publishedTime: "2026-09-01" });
  });

  it("publishes no canonical or language links for a page kept out of search results", async () => {
    const metadata = await buildPageMetadata({ ...page, noindex: true, ogType: "article", image: "route" });
    expect(metadata.robots).toEqual({ index: false, follow: false });
    expect(metadata).not.toHaveProperty("alternates");
  });
});
