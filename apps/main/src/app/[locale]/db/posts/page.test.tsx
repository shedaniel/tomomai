import type { AnchorHTMLAttributes } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CanonicalGameId } from "@/lib/games/ids";

const current = vi.hoisted(() => ({ game: "maimai" as CanonicalGameId }));

vi.mock("next-intl/server", async () => {
  const { createTranslator } = await import("next-intl");
  const { loadMessages } = await import("@/i18n/messages");
  const translator = async (namespace: string) => createTranslator({
    locale: "en",
    messages: await loadMessages(current.game, "en"),
    namespace,
    onError(error) { throw error; },
  });
  return {
    getTranslations: (options: string | { namespace: string }) => translator(typeof options === "string" ? options : options.namespace),
  };
});
vi.mock("@/lib/games/current", async () => {
  const { toFrontendGame } = await import("@/lib/games/frontend");
  const { getGame } = await import("@/lib/games/registry");
  return { getCurrentGame: () => toFrontendGame(getGame(current.game), ["intl", "jp"]) };
});
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NEXT_NOT_FOUND"); } }));
vi.mock("@/i18n/locale-server", () => ({ getLocale: async () => "en", setStaticLocale: async () => {} }));
vi.mock("@/i18n/navigation", () => ({ Link: ({ children, href }: AnchorHTMLAttributes<HTMLAnchorElement>) => <a href={href}>{children}</a> }));
vi.mock("@/lib/base-url", () => ({ resolveBaseUrl: () => "https://site.test" }));
vi.mock("@/lib/og", () => ({ OG_SIZE: {}, createOGImage: () => new Response("image") }));
vi.mock("@/lib/posts", () => ({
  getAllPostsMeta: () => [{ slug: "2026-09-01-update", canonicalSlug: "update", locale: "en", title: "September update", date: "2026-09-01", version: "N/A", summary: "What changed" }],
}));

import PostsPage, { generateMetadata } from "./page";
import { MISSING_PAGE_METADATA } from "@/lib/seo";
import PostsImage from "./opengraph-image";

const props = { params: Promise.resolve({ locale: "en" }) };

beforeEach(() => { current.game = "maimai"; });

describe("changelog", () => {
  it("lists the posts on the maimai site", async () => {
    expect(renderToStaticMarkup(await PostsPage(props))).toContain('href="/db/posts/2026-09-01-update"');
    expect((await generateMetadata(props)).title).toBe("Changelog | tomomai");
    expect((await PostsImage({ id: Promise.resolve("en") })).status).toBe(200);
  });

  it("does not exist on the CHUNITHM site", async () => {
    current.game = "chunithm";
    await expect(PostsPage(props)).rejects.toThrow("NEXT_NOT_FOUND");
    expect(await generateMetadata(props)).toEqual(MISSING_PAGE_METADATA);
    expect((await PostsImage({ id: Promise.resolve("en") })).status).toBe(404);
  });
});
